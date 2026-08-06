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
import {
  getOrCreateChannel,
  getOrCreateConversation,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';
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

      // 3) Parse payload
      let payload: Payload;
      try {
        payload = payloadSchema.parse(request.body);
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
