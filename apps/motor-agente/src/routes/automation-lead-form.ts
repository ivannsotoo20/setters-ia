/**
 * Endpoint POST /automations/lead-form/:tenant_token (Hito 9 sub-fase 3).
 *
 * Disparado por automations externas del trainer (n8n, GHL Workflow, Tally,
 * Meta Lead Ads, Typeform, Zapier...) cuando un lead rellena un formulario
 * VSL/anuncio Meta y deja phone + nombre. El motor:
 *
 *   1. Resuelve el tenant por `tenant_token` (purpose='lead_form_webhook').
 *   2. Verifica opcional X-Form-Secret contra integration_accounts.webhook_secret
 *      (cuenta ycloud activa del tenant). Modo configurable LEAD_FORM_VERIFY_MODE
 *      (disabled|warn|enforce).
 *   3. Parsea payload Zod {phone, first_name?, last_name?, email?, source?, external_id?}.
 *   4. Normaliza phone a E.164.
 *   5. Dedup Redis 60s por (tenant, phone) para evitar dobles disparos.
 *   6. Lee tenant_configs.welcome_template_id → 409 si NULL.
 *   7. Resuelve canal WA (channel_type='whatsapp' via_provider='ycloud').
 *   8. upsertLead + getOrCreateConversation.
 *   9. sendWelcomeTemplate (envía plantilla YCloud + INSERT message ai +
 *      UPDATE conversation a F1 outbound bienvenida + ai_paused_until=null).
 *  10. Best-effort UPDATE integration_accounts.last_webhook_at (Sprint 9 dashboard).
 *  11. 200 con {ok, lead_id, conversation_id, provider_message_id}.
 *
 * Registro para el panel (2026-09-03): cada formulario que llega a cualificarse
 * deja una fila en `lead_form_submissions` (veredicto, quién decidió, motivo) y,
 * si se aprueba, la fila se completa con lead_id / conversation_id /
 * welcome_sent o con el error que impidió la bienvenida. Best-effort: un fallo
 * al escribir el registro NUNCA tumba el flujo. El panel lo lista en
 * /leads/formularios.
 *
 * Errores:
 *   404 invalid token, 401 secret mismatch (enforce), 400 invalid payload,
 *   409 no welcome template configured, 422 lead/template/account inválido,
 *   500 error interno, 502 YCloud upstream falla.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import { env } from '../config/env.js';
import { tryClaimDedupKey } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { isValidBearer } from '../lib/timing-safe-bearer.js';
import { getAnthropicForTenant } from '../lib/anthropic.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  hasConversationWithSource,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';
import { qualifyFormLead, type QualifyResult } from '../services/lead-qualifier.js';
import {
  sendWelcomeTemplate,
  WelcomeTemplateError,
} from '../services/send-welcome-template.js';

interface RouteParams {
  tenant_token: string;
}

const payloadSchema = z.object({
  phone: z.string().min(6),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  source: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  /**
   * Respuestas del formulario (Tally, Meta Lead Ads, Typeform…), como pares
   * etiqueta → valor. La automation externa (n8n / GHL Workflow) es la que
   * aplana los campos del proveedor a este objeto; el motor NO conoce el
   * esquema de Tally y no debe adivinarlo.
   *
   * Se persisten en `conversations.custom_fields.form_answers` y el pipeline
   * las inyecta al system prompt para que el setter NO repregunte lo que la
   * persona acaba de escribir.
   */
  answers: z.record(z.string(), z.unknown()).optional().nullable(),
});

type Payload = z.infer<typeof payloadSchema>;

/**
 * Aplanador del webhook NATIVO de Tally (2026-08-25).
 *
 * Hasta hoy este endpoint exigía el payload plano y el aplanado lo hacía n8n.
 * n8n se apagó (migración de Tania), así que el motor acepta el FORM_RESPONSE
 * de Tally tal y como Tally lo manda, sin intermediario:
 *
 *   { eventId, eventType: "FORM_RESPONSE",
 *     data: { responseId, fields: [{ key, label, type, value, options? }] } }
 *
 * Mapeo:
 *   - phone      → primer campo de tipo teléfono (INPUT_PHONE_NUMBER / PHONE_NUMBER).
 *                  Fallback: primer campo cuyo label suene a teléfono/WhatsApp.
 *   - first_name → primer campo cuyo label sea "nombre"/"name" (best-effort).
 *   - email      → primer campo de tipo INPUT_EMAIL, o label email/correo.
 *   - answers    → TODOS los campos como label → valor, con las opciones de
 *                  choice resueltas a su texto (Tally manda ids).
 *   - external_id→ data.responseId (dedup), source → 'tally'.
 *
 * Devuelve null si el body no tiene la forma de Tally — el caller sigue con el
 * payload plano de siempre, así que n8n/GHL Workflow siguen funcionando igual.
 */
/** ¿El body tiene la forma del webhook nativo de Tally? (independiente de si trae teléfono) */
export function isTallyShape(body: unknown): boolean {
  const b = body as { eventType?: unknown; data?: { fields?: unknown } } | null;
  return b?.eventType === 'FORM_RESPONSE' && Array.isArray(b?.data?.fields);
}

export function flattenTallyPayload(body: unknown): Record<string, unknown> | null {
  const b = body as { eventType?: unknown; data?: { responseId?: unknown; fields?: unknown } } | null;
  if (!b || b.eventType !== 'FORM_RESPONSE' || !Array.isArray(b.data?.fields)) return null;

  interface TallyField {
    label?: unknown;
    type?: unknown;
    value?: unknown;
    options?: Array<{ id?: unknown; text?: unknown }>;
  }
  const fields = b.data!.fields as TallyField[];

  const resolveValue = (f: TallyField): unknown => {
    if (Array.isArray(f.value) && Array.isArray(f.options)) {
      const byId = new Map(f.options.map((o) => [String(o.id), String(o.text ?? o.id)]));
      const texts = f.value.map((v) => byId.get(String(v)) ?? String(v));
      return texts.length === 1 ? texts[0] : texts.join(', ');
    }
    return f.value;
  };

  const isPhoneType = (t: unknown) =>
    typeof t === 'string' && /PHONE/i.test(t);
  const labelOf = (f: TallyField) => (typeof f.label === 'string' ? f.label : '');

  const phoneField =
    fields.find((f) => isPhoneType(f.type) && typeof f.value === 'string' && f.value.trim() !== '') ??
    fields.find(
      (f) =>
        /tel[eé]fono|whatsapp|phone|m[oó]vil|celular/i.test(labelOf(f)) &&
        typeof f.value === 'string' &&
        f.value.trim() !== '',
    );
  if (!phoneField) return null; // sin teléfono no hay lead WA que crear

  const nameField = fields.find(
    (f) => /^nombre\b|^name\b|first.?name/i.test(labelOf(f).trim()) && typeof f.value === 'string',
  );
  const emailField = fields.find(
    (f) =>
      ((typeof f.type === 'string' && /EMAIL/i.test(f.type)) ||
        /email|correo/i.test(labelOf(f))) &&
      typeof f.value === 'string' &&
      f.value.includes('@'),
  );

  const answers: Record<string, unknown> = {};
  for (const f of fields) {
    const label = labelOf(f).trim();
    const value = resolveValue(f);
    if (!label || value == null || value === '') continue;
    // Los CHECKBOXES de Tally llegan por duplicado: el campo padre (value=[ids]
    // + options, que resolveValue traduce a texto) y un pseudo-campo booleano
    // por opción con label "Pregunta (Opción)". Los booleanos solo meten ruido:
    // el texto elegido ya está en el padre.
    if (typeof value === 'boolean' && /\([^)]+\)$/.test(label)) continue;
    answers[label] = value;
  }

  // El literal del formulario suele ser "Nombre y apellidos"; para saludar en la
  // plantilla ("Hola {{nombre}}") va solo el primer nombre — mismo criterio que
  // el nombre_corto del flujo n8n que esto reemplaza.
  const firstName = nameField
    ? String(nameField.value).trim().split(/\s+/)[0] ?? null
    : null;

  return {
    phone: String(phoneField.value).trim(),
    first_name: firstName,
    email: emailField ? String(emailField.value).trim() : null,
    source: 'tally',
    external_id:
      typeof b.data!.responseId === 'string' ? b.data!.responseId : null,
    answers,
  };
}

export async function automationLeadFormRoutes(app: FastifyInstance): Promise<void> {
  // GET /ping para que el wizard onboarding y dashboard health puedan verificar
  // conectividad sin disparar el flujo completo.
  app.get<{ Params: RouteParams }>(
    '/automations/lead-form/:tenant_token/ping',
    async (
      request: FastifyRequest<{ Params: RouteParams }>,
      reply: FastifyReply,
    ) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'lead_form_webhook');
      if (!resolved) {
        return reply.code(404).send({ ok: false, error: 'tenant_token invalid or inactive' });
      }
      return reply.code(200).send({
        ok: true,
        tenant_id: resolved.tenantId,
        purpose: 'lead_form_webhook',
        verify_mode: env.LEAD_FORM_VERIFY_MODE,
        message: 'Endpoint ready. POST aquí con {phone, first_name?, ...} para crear lead + enviar bienvenida.',
        timestamp: new Date().toISOString(),
      });
    },
  );

  app.post<{ Params: RouteParams; Body: unknown }>(
    '/automations/lead-form/:tenant_token',
    async (
      request: FastifyRequest<{ Params: RouteParams; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();

      // 1) Resolver tenant
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'lead_form_webhook');
      if (!resolved) {
        return reply.code(404).send({ error: 'tenant_token invalid or inactive' });
      }
      const { tenantId } = resolved;

      // 2) Optional shared-secret verify (warn|enforce|disabled)
      const verifyMode = env.LEAD_FORM_VERIFY_MODE;
      if (verifyMode !== 'disabled') {
        const provided = pickHeader(request, 'x-form-secret');
        const expected = await loadLeadFormSecret(supabase, tenantId);
        if (expected) {
          if (!provided) {
            request.log.warn({ tenantId, verifyMode }, 'lead-form: missing X-Form-Secret');
            if (verifyMode === 'enforce') {
              return reply.code(401).send({ error: 'missing_secret' });
            }
          } else if (!isValidBearer(provided, expected)) {
            request.log.warn({ tenantId, verifyMode }, 'lead-form: secret mismatch');
            if (verifyMode === 'enforce') {
              return reply.code(401).send({ error: 'invalid_secret' });
            }
          }
        }
      }

      // 3) Parse payload. Si el body viene con la forma nativa de Tally
      //    (FORM_RESPONSE), se aplana primero; si no, se acepta el formato
      //    plano de siempre (n8n / GHL Workflow / curl).
      const tallyFlattened = flattenTallyPayload(request.body);
      if (tallyFlattened) {
        request.log.info(
          { answerCount: Object.keys((tallyFlattened.answers as object) ?? {}).length },
          'lead-form: payload Tally nativo aplanado',
        );
      } else if (isTallyShape(request.body)) {
        // FORM_RESPONSE de Tally SIN teléfono utilizable. Pasa con el botón
        // "Send test request" de Tally (manda datos de ejemplo) y con un envío
        // real cuyo campo de teléfono venga vacío. Un webhook debe ACK-ear lo
        // que nunca va a poder procesar: devolver 4xx aquí hace que Tally
        // marque el endpoint en rojo y reintente sin sentido — un formulario
        // sin teléfono no puede convertirse en lead de WhatsApp, hoy ni nunca.
        request.log.warn(
          {},
          'lead-form: FORM_RESPONSE de Tally sin teléfono — ack e ignorar (test de Tally o campo vacío)',
        );
        return reply.code(200).send({ ok: true, ignored: 'tally_sin_telefono' });
      }
      let payload: Payload;
      try {
        payload = payloadSchema.parse(tallyFlattened ?? request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid_payload', issues: err.flatten() });
        }
        throw err;
      }

      // 4) Normalize phone E.164
      const phoneNormalized = normalizePhoneE164(payload.phone);
      if (!phoneNormalized) {
        return reply.code(400).send({
          error: 'invalid_phone',
          message: 'phone debe ser E.164 (ej: +34600123456) o solo dígitos (6-15)',
        });
      }

      // 5) Dedup Redis 60s
      const dedupKey = `leadform:${tenantId}:${phoneNormalized}`;
      const claimed = await tryClaimDedupKey(dedupKey, 60);
      if (!claimed) {
        return reply.code(200).send({
          ok: true,
          deduped: true,
          tenant_id: tenantId,
          phone: phoneNormalized,
        });
      }

      // 5.1) Guarda de reenvío: si este teléfono YA recibió la bienvenida (tiene
      //      conversación con source='bienvenida' viva), no se le manda otra.
      //      Replica el check del n8n que este endpoint reemplaza (consultaba su
      //      CRM antes de enviar): sin esto, un re-trigger del Workflow GHL o un
      //      segundo envío del formulario duplicaría la plantilla al lead.
      const alreadyWelcomed = await hasConversationWithSource(
        supabase,
        tenantId,
        phoneNormalized,
        'bienvenida',
      );
      if (alreadyWelcomed) {
        request.log.info(
          { tenantId, phone: phoneNormalized.slice(0, 6) + '…' },
          'lead-form: lead ya tiene bienvenida activa — no se reenvía',
        );
        return reply.code(200).send({
          ok: true,
          already_welcomed: true,
          tenant_id: tenantId,
        });
      }

      // 5.2) Cualificación (2026-08-25) — SOLO para payloads de formulario con
      //      respuestas (Tally). Porta el workflow n8n "Formulario Tally": dos
      //      reglas deterministas (dolor reciente rechaza, país Tier A aprueba)
      //      y evaluador IA con los criterios del entrenador para el resto.
      //      Un payload plano sin answers (Workflow GHL de anuncios) no trae
      //      nada que cualificar y pasa directo, como siempre.
      //      Rechazado → NO se crea lead ni se envía nada; queda en el log y en
      //      llm_calls (role='qualifier') si decidió la IA.
      let veredicto: QualifyResult = { decision: 'sin_filtro', motivo: null, evaluadoPor: 'ninguno' };
      if (tallyFlattened && payload.answers && Object.keys(payload.answers).length > 0) {
        const anthropic = await getAnthropicForTenant(supabase, tenantId);
        veredicto = await qualifyFormLead({
          supabase,
          anthropic: anthropic as never,
          tenantId,
          answers: payload.answers,
          phone: phoneNormalized,
        });
        request.log.info(
          {
            tenantId,
            decision: veredicto.decision,
            evaluadoPor: veredicto.evaluadoPor,
            motivo: veredicto.motivo,
          },
          'lead-form: cualificación evaluada',
        );
      }

      // 5.3) Registro del formulario para el panel (/leads/formularios). Se
      //      escribe SIEMPRE que un formulario llega hasta aquí, tenga filtro
      //      o no (un payload plano sin respuestas queda como sin_filtro): la
      //      entrenadora ve todo lo que entró y qué se hizo con cada uno.
      //      Best-effort — si la tabla falla, el lead se procesa igual.
      const submissionId = await recordSubmission(request, supabase, {
        tenantId,
        phone: phoneNormalized,
        firstName: payload.first_name ?? null,
        answers: payload.answers ?? {},
        veredicto,
      });

      if (veredicto.decision === 'rechazado') {
        return reply.code(200).send({
          ok: true,
          qualified: false,
          decision: 'rechazado',
          evaluado_por: veredicto.evaluadoPor,
          tenant_id: tenantId,
        });
      }

      // 6) welcome_template_id requerido
      const { data: cfg, error: cfgErr } = await supabase
        .from('tenant_configs')
        .select('welcome_template_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (cfgErr) {
        request.log.error(
          { tenantId, err: cfgErr.message },
          'lead-form: tenant_configs read failed',
        );
        return reply.code(500).send({ error: 'tenant_configs_read_failed' });
      }
      const welcomeTemplateId =
        cfg?.welcome_template_id != null ? Number(cfg.welcome_template_id) : null;
      if (!welcomeTemplateId) {
        await patchSubmission(request, supabase, submissionId, {
          error: 'no_welcome_template_configured',
        });
        return reply.code(409).send({
          error: 'no_welcome_template_configured',
          message:
            'tenant sin welcome_template_id en tenant_configs. Configurar en /settings/followup-templates.',
        });
      }

      // 7) Canal WA via ycloud
      let channelId: number;
      try {
        const ch = await getOrCreateChannel({
          supabase,
          tenantId,
          channelType: 'whatsapp',
          viaProvider: 'ycloud',
        });
        channelId = ch.channelId;
      } catch (err) {
        request.log.error(
          { tenantId, err: err instanceof Error ? err.message : String(err) },
          'lead-form: channel resolution failed',
        );
        await patchSubmission(request, supabase, submissionId, {
          error: shortError('channel_resolution_failed', err),
        });
        return reply.code(500).send({ error: 'channel_resolution_failed' });
      }

      // 8) Upsert lead + conversation
      const { leadId, created: leadCreated } = await upsertLead({
        supabase,
        tenantId,
        channelId,
        externalId: phoneNormalized,
        firstName: payload.first_name ?? null,
        lastName: payload.last_name ?? null,
        phone: phoneNormalized,
        email: payload.email ?? null,
      });
      const { conversationId } = await getOrCreateConversation({
        supabase,
        tenantId,
        leadId,
        channelId,
      });

      // 8b) Persistir las respuestas del formulario en `conversations.custom_fields`.
      //     El setter las lee por `extraSystemSuffix` (ver lib/lead-origin.ts) para
      //     no repreguntar lo que la persona acaba de escribir.
      //     Best-effort: si falla, la bienvenida sale igual — perder el contexto
      //     degrada la conversación, pero no responder la rompe del todo.
      if (payload.answers && Object.keys(payload.answers).length > 0) {
        try {
          await persistFormAnswers(supabase, conversationId, payload.answers);
        } catch (err) {
          request.log.warn(
            {
              tenantId,
              conversationId,
              answerCount: Object.keys(payload.answers).length,
              err: err instanceof Error ? err.message : String(err),
            },
            'lead-form: persist form answers failed (no fatal)',
          );
        }
      }

      // 9) Send welcome
      try {
        const result = await sendWelcomeTemplate({
          supabase,
          tenantId,
          leadId,
          conversationId,
          templateId: welcomeTemplateId,
        });

        // 10) Best-effort touch last_webhook_at
        await touchLastWebhookAt(supabase, tenantId, 'ycloud').catch((err) => {
          request.log.warn(
            { tenantId, err: err instanceof Error ? err.message : String(err) },
            'lead-form: touch last_webhook_at failed (no fatal)',
          );
        });

        // 10b) Cerrar el registro del formulario: bienvenida enviada.
        await patchSubmission(request, supabase, submissionId, {
          lead_id: leadId,
          conversation_id: conversationId,
          welcome_sent: true,
          error: null,
        });

        return reply.code(200).send({
          ok: true,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId,
          provider_message_id: result.providerMessageId,
          lead_created: leadCreated,
          source: payload.source ?? null,
        });
      } catch (err) {
        // El lead y la conversación ya existen aunque la bienvenida no saliera:
        // se enlazan en el registro junto al error para que la entrenadora
        // pueda ir a la conversación y mandarla a mano.
        await patchSubmission(request, supabase, submissionId, {
          lead_id: leadId,
          conversation_id: conversationId,
          welcome_sent: false,
          error:
            err instanceof WelcomeTemplateError
              ? shortError(err.reason, err)
              : shortError('welcome_failed', err),
        });
        if (err instanceof WelcomeTemplateError) {
          request.log.warn(
            {
              tenantId,
              leadId,
              conversationId,
              reason: err.reason,
              err: err.message,
            },
            'lead-form: sendWelcomeTemplate failed',
          );
          return reply.code(err.httpStatus).send({
            error: err.reason,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function loadLeadFormSecret(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from('integration_accounts')
    .select('webhook_secret')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ycloud')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.webhook_secret === 'string' && data.webhook_secret.length > 0
    ? data.webhook_secret
    : null;
}

/**
 * Merge de las respuestas del formulario en `conversations.custom_fields`.
 *
 * `custom_fields` es JSONB NOT NULL (default '{}'). Se hace read-modify-write
 * conservando el resto de claves: la columna es de uso general y este endpoint
 * NO es su único escritor potencial.
 *
 * NUNCA se loguea el contenido: son respuestas de la lead (PII).
 */
async function persistFormAnswers(
  supabase: ReturnType<typeof getSupabase>,
  conversationId: number,
  answers: Record<string, unknown>,
): Promise<void> {
  const { data, error: readErr } = await supabase
    .from('conversations')
    .select('custom_fields')
    .eq('id', conversationId)
    .maybeSingle();
  if (readErr) throw new Error(`read custom_fields: ${readErr.message}`);

  const current =
    data?.custom_fields && typeof data.custom_fields === 'object'
      ? (data.custom_fields as Record<string, unknown>)
      : {};

  const { error: updErr } = await supabase
    .from('conversations')
    .update({
      custom_fields: { ...current, form_answers: answers },
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
  if (updErr) throw new Error(`update custom_fields: ${updErr.message}`);
}

// ----------------------------------------------------------------------------
// Registro de formularios (lead_form_submissions) — migración 077
// ----------------------------------------------------------------------------

// TODO regenerar tipos tras aplicar la migración 077 (packages/db/src/types.generated.ts).
// `getSupabase()` devuelve un SupabaseClient sin generic `Database`, así que
// `.from('lead_form_submissions')` compila sin cast; cuando se regeneren los
// tipos, estas dos funciones quedan cubiertas por el schema.
const LEAD_FORM_SUBMISSIONS_TABLE = 'lead_form_submissions';

interface RecordSubmissionInput {
  tenantId: number;
  phone: string;
  firstName: string | null;
  /** Respuestas aplanadas label → valor. PII: se guardan, no se loguean. */
  answers: Record<string, unknown>;
  veredicto: QualifyResult;
}

interface SubmissionPatch {
  lead_id?: number;
  conversation_id?: number;
  welcome_sent?: boolean;
  error?: string | null;
}

/**
 * INSERT best-effort de la fila del formulario. Devuelve el id (para los
 * UPDATE posteriores) o null si no se pudo escribir — en ese caso los patch
 * son no-op y el flujo sigue: perder el registro es un warn, no un fallo.
 *
 * `answers` se guardan tal cual: son las respuestas de la persona al
 * formulario de la entrenadora, no hay tokens ni secretos posibles. No se pasa
 * por `safeLogBody` a propósito — redacta por substring ('secret', 'token'…) y
 * una pregunta en castellano con "secreto" en el label acabaría con la
 * respuesta sustituida por '<REDACTED>' en el panel.
 */
async function recordSubmission(
  request: FastifyRequest,
  supabase: ReturnType<typeof getSupabase>,
  input: RecordSubmissionInput,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from(LEAD_FORM_SUBMISSIONS_TABLE)
      .insert({
        tenant_id: input.tenantId,
        phone: input.phone,
        first_name: input.firstName,
        answers: input.answers,
        decision: input.veredicto.decision,
        motivo: input.veredicto.motivo,
        evaluado_por: input.veredicto.evaluadoPor,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id?: unknown } | null)?.id;
    return typeof id === 'number' || typeof id === 'string' ? Number(id) : null;
  } catch (err) {
    request.log.warn(
      {
        tenantId: input.tenantId,
        decision: input.veredicto.decision,
        err: err instanceof Error ? err.message : String(err),
      },
      'lead-form: insert lead_form_submissions failed (no fatal)',
    );
    return null;
  }
}

/** UPDATE best-effort de la fila del formulario. No-op si no hay id. */
async function patchSubmission(
  request: FastifyRequest,
  supabase: ReturnType<typeof getSupabase>,
  submissionId: number | null,
  patch: SubmissionPatch,
): Promise<void> {
  if (submissionId == null) return;
  try {
    const { error } = await supabase
      .from(LEAD_FORM_SUBMISSIONS_TABLE)
      .update(patch)
      .eq('id', submissionId);
    if (error) throw new Error(error.message);
  } catch (err) {
    request.log.warn(
      {
        submissionId,
        patchKeys: Object.keys(patch),
        err: err instanceof Error ? err.message : String(err),
      },
      'lead-form: update lead_form_submissions failed (no fatal)',
    );
  }
}

/** "reason: mensaje" recortado para la columna `error` (legible en el panel). */
function shortError(reason: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `${reason}: ${msg}`.slice(0, 200);
}

async function touchLastWebhookAt(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
  provider: string,
): Promise<void> {
  await supabase
    .from('integration_accounts')
    .update({ last_webhook_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('is_active', true);
}

function pickHeader(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return undefined;
}

/**
 * Normaliza un phone a E.164. Acepta:
 *   - "+34600123456" → "+34600123456"
 *   - "34 600 123 456" / "34-600-123456" → "+34600123456"
 *   - Si no arranca con + y no parece dígitos puros (6-15), devuelve null.
 *
 * Validación deliberadamente laxa: el validador estricto de Meta lo hará YCloud
 * al enviar la plantilla (devolverá 4xx si el wa_id no existe).
 */
export function normalizePhoneE164(phone: string): string | null {
  if (typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s\-()]/g, '').trim();
  if (/^\+\d{6,15}$/.test(cleaned)) return cleaned;
  if (/^\d{6,15}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}
