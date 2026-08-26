/**
 * Service de envío de bienvenida WA (Hito 9 sub-fase 2).
 *
 * Reusable desde dos paths:
 *   1. Endpoint POST /automations/lead-form/:tenant_token (sub-fase 3) — disparado
 *      por automations externas (n8n trainer / GHL workflow / form Meta) cuando
 *      un lead rellena un formulario VSL/anuncio Meta.
 *   2. Botón "Enviar bienvenida" en la ficha del contacto del panel (sub-fase 4)
 *      — disparado manualmente por el trainer cuando agrega un lead a mano.
 *
 * Flujo:
 *   - Carga la plantilla designada (followup_templates.id) + valida que es WA + provider
 *     ycloud/meta_cloud + status='approved' + tiene provider_template_id + language.
 *   - Carga el lead → phone (E.164) (preferencia: lead.phone, fallback lead.external_id).
 *   - Carga integration_account provider='ycloud' del tenant + decode credentials +
 *     business_phone de connection_config.
 *   - Mapea variables de la plantilla al bodyVariables (usando `sample` por ahora).
 *   - Llama ycloudSendTemplate.
 *   - INSERT conversation_messages source='ai' + UPDATE conversations a F1
 *     conversation_source='bienvenida' direction='outbound' ai_paused_until=null.
 *
 * Devuelve `WelcomeTemplateError` tipado (con `httpStatus` listo para devolver al
 * caller HTTP) en lugar de throw genérico, para que el endpoint lead-form pueda
 * mapear los errores a 4xx/5xx semánticos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ycloudSendTemplate,
  YCloudTemplatesError,
  ghlSendTemplate,
  GhlTemplatesError,
} from '@fyzon/channel-adapters';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { resolveGhlCredentials } from '../lib/resolve-ghl-credentials.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export type WelcomeTemplateErrorReason =
  | 'template_not_found'
  | 'template_not_supported'
  | 'lead_not_found'
  | 'lead_no_phone'
  | 'lead_no_ghl_contact'
  | 'no_provider_account'
  | 'no_ycloud_account'
  | 'no_api_key'
  | 'no_business_phone'
  | 'send_failed'
  | 'persist_failed';

export class WelcomeTemplateError extends Error {
  readonly reason: WelcomeTemplateErrorReason;
  readonly httpStatus: number;
  override readonly cause?: unknown;

  constructor(
    reason: WelcomeTemplateErrorReason,
    message: string,
    httpStatus = 422,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'WelcomeTemplateError';
    this.reason = reason;
    this.httpStatus = httpStatus;
    if (cause !== undefined) this.cause = cause;
  }
}

export interface SendWelcomeTemplateParams {
  supabase: SupabaseClient;
  tenantId: number;
  leadId: number;
  conversationId: number;
  templateId: number;
  fetchImpl?: typeof fetch;
}

export interface SendWelcomeTemplateResult {
  providerMessageId: string;
  status: string;
  templateName: string;
  bodyText: string;
}

export async function sendWelcomeTemplate(
  params: SendWelcomeTemplateParams,
): Promise<SendWelcomeTemplateResult> {
  const { supabase, tenantId, leadId, conversationId, templateId, fetchImpl } = params;

  // 1) Plantilla — valida channel_kind, provider, status, provider_template_id, language.
  const { data: template, error: tplErr } = await supabase
    .from('followup_templates')
    .select(
      'id, tenant_id, name, channel_kind, provider, body, provider_template_id, language, variables, status',
    )
    .eq('id', templateId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tplErr || !template) {
    throw new WelcomeTemplateError(
      'template_not_found',
      `template ${templateId} no encontrada o no pertenece al tenant ${tenantId}`,
      404,
      tplErr ?? undefined,
    );
  }
  if (template.channel_kind !== 'whatsapp') {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} channel_kind='${String(template.channel_kind)}' — solo whatsapp`,
      422,
    );
  }
  const provider = String(template.provider ?? '');
  // Sprint Iota.5 PR-C: ampliado a 'ghl' (validación empírica en smoke F).
  // 'meta_cloud' aceptado en el código aunque aún no es funcional (Iota.6).
  if (provider !== 'ycloud' && provider !== 'meta_cloud' && provider !== 'ghl') {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} provider='${provider}' — solo ycloud/meta_cloud/ghl`,
      422,
    );
  }
  if (provider === 'meta_cloud') {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} provider='meta_cloud' — no implementado (aparcado a Iota.6 cuando Iván sea BSP)`,
      422,
    );
  }
  if (template.status !== 'approved') {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} status='${String(template.status)}' — debe estar approved`,
      422,
    );
  }
  const providerTemplateId =
    typeof template.provider_template_id === 'string' ? template.provider_template_id : '';
  const language = typeof template.language === 'string' ? template.language : '';
  if (!providerTemplateId || !language) {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} sin provider_template_id o language`,
      422,
    );
  }

  // 2) Lead — phone E.164 (preferencia phone, fallback external_id si parece phone).
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, tenant_id, external_id, phone, first_name, last_name')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (leadErr || !lead) {
    throw new WelcomeTemplateError(
      'lead_not_found',
      `lead ${leadId} no encontrado en tenant ${tenantId}`,
      404,
      leadErr ?? undefined,
    );
  }
  const toPhone =
    (typeof lead.phone === 'string' && lead.phone.trim().length > 0 && lead.phone) ||
    (typeof lead.external_id === 'string' &&
      lead.external_id.trim().length > 0 &&
      lead.external_id);
  if (!toPhone) {
    throw new WelcomeTemplateError(
      'lead_no_phone',
      `lead ${leadId} sin phone ni external_id usable`,
      422,
    );
  }

  // 3) bodyVariables: mapear cada variable de la plantilla al campo correspondiente
  //    del lead según su `name` (case-insensitive). Fallback al `sample` registrado
  //    en la plantilla si el lead no tiene el campo. Soporta nombres en español
  //    (nombre, apellido) y en inglés (first_name, last_name, etc.) — el sync
  //    preserva el placeholder original del template Meta.
  const variables = Array.isArray(template.variables)
    ? (template.variables as Array<{ name?: string | null; sample?: string | null }>)
    : [];
  const bodyVariables = variables.map((v) => resolveTemplateVariable(v, lead));

  // 4) Branch por provider — Sprint Iota.5 PR-C.
  let sendResult: { providerMessageId: string; status?: string };
  if (provider === 'ycloud') {
    sendResult = await sendViaYCloud({
      supabase,
      tenantId,
      providerTemplateId,
      language,
      toPhone,
      bodyVariables,
      fetchImpl,
    });
  } else if (provider === 'ghl') {
    sendResult = await sendViaGhl({
      supabase,
      tenantId,
      conversationId,
      providerTemplateId,
      bodyVariables,
      fetchImpl,
    });
  } else {
    // Defensa redundante — la validación de líneas anteriores debería capturarlo.
    throw new WelcomeTemplateError(
      'template_not_supported',
      `provider='${provider}' no soportado para envío`,
      422,
    );
  }

  // 6) Persistir mensaje + actualizar conversation a F1 outbound bienvenida + activar IA.
  const sentAt = new Date().toISOString();
  // Parche Hito 9 2.1 (2026-05-15) — el body persistido en conversation_messages
  // debe estar interpolado con datos reales (lo que el lead realmente ve por WA)
  // y NO el body raw con `{{nombre}}` literal. La WA enviada por Meta usa
  // bodyVariables (cubierto en paso 4), pero el panel `/conversations` lee
  // conversation_messages.content para mostrar la conv al trainer.
  const rawBody =
    typeof template.body === 'string' && template.body.trim().length > 0
      ? template.body
      : `[template:${providerTemplateId}]`;
  const bodyText = interpolateTemplateBody(rawBody, variables, lead);

  const { error: insertErr } = await supabase.from('conversation_messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    source: 'ai',
    content_type: 'text',
    content: bodyText,
    sent_at: sentAt,
  });
  if (insertErr) {
    throw new WelcomeTemplateError(
      'persist_failed',
      `INSERT conversation_messages falló post-send: ${insertErr.message}`,
      500,
      insertErr,
    );
  }

  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      direction: 'outbound',
      conversation_source: 'bienvenida',
      phase_number: 1,
      ai_paused_until: null,
      updated_at: sentAt,
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    // No fatal: el mensaje ya se envió + persistió. Log warn para investigar.
    logger.warn(
      { conversationId, tenantId, err: updateErr.message },
      'sendWelcomeTemplate: UPDATE conversations falló post-send (no fatal)',
    );
  }

  logger.info(
    {
      tenantId,
      leadId,
      conversationId,
      templateId,
      templateName: providerTemplateId,
      provider,
      providerMessageId: sendResult.providerMessageId,
    },
    'sendWelcomeTemplate: bienvenida WA enviada',
  );

  return {
    providerMessageId: sendResult.providerMessageId,
    status: sendResult.status ?? 'sent',
    templateName: providerTemplateId,
    bodyText,
  };
}

// ---------------------------------------------------------------------------
// Per-provider senders (Sprint Iota.5 PR-C)
// ---------------------------------------------------------------------------

interface SendViaYCloudParams {
  supabase: SupabaseClient;
  tenantId: number;
  providerTemplateId: string;
  language: string;
  toPhone: string;
  bodyVariables: string[];
  fetchImpl?: typeof fetch;
}

async function sendViaYCloud(
  params: SendViaYCloudParams,
): Promise<{ providerMessageId: string; status?: string }> {
  const { supabase, tenantId, providerTemplateId, language, toPhone, bodyVariables, fetchImpl } =
    params;

  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id, provider, credentials, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ycloud')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (iaErr || !ia) {
    throw new WelcomeTemplateError(
      'no_ycloud_account',
      `tenant ${tenantId} sin integration_account ycloud activa`,
      409,
      iaErr ?? undefined,
    );
  }
  const integrationAccountId = Number(ia.id);
  const credentials = decodeCredentialsRow(ia, integrationAccountId);
  // Hito 9 Parche 2.5 (2026-05-15) — el panel persiste `apiKey` (camelCase, ver
  // apps/panel/lib/actions/integrations.ts:115) mientras el motor históricamente
  // ha leído `api_key` (snake_case). Mismo fallback que apps/panel/lib/manual-send.ts:113-119.
  const apiKey =
    typeof credentials.apiKey === 'string' && credentials.apiKey.length > 0
      ? credentials.apiKey
      : typeof credentials.api_key === 'string'
        ? credentials.api_key
        : '';
  if (!apiKey) {
    throw new WelcomeTemplateError(
      'no_api_key',
      `integration_account ${integrationAccountId} (ycloud) sin api_key/apiKey en credentials`,
      422,
    );
  }
  const connectionConfig = (ia.connection_config ?? {}) as Record<string, unknown>;
  const businessPhone =
    typeof connectionConfig.business_phone === 'string' ? connectionConfig.business_phone : '';
  if (!businessPhone) {
    throw new WelcomeTemplateError(
      'no_business_phone',
      `integration_account ${integrationAccountId} (ycloud) sin business_phone en connection_config`,
      422,
    );
  }

  try {
    const result = await ycloudSendTemplate({
      apiKey,
      from: businessPhone,
      to: toPhone,
      templateName: providerTemplateId,
      language,
      bodyVariables,
      baseUrl: env.YCLOUD_API_BASE,
      fetchImpl,
    });
    return { providerMessageId: result.providerMessageId, status: result.status };
  } catch (err) {
    if (err instanceof YCloudTemplatesError) {
      throw new WelcomeTemplateError(
        'send_failed',
        `YCloud sendTemplate failed: HTTP ${err.status}`,
        502,
        err,
      );
    }
    throw err;
  }
}

interface SendViaGhlParams {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  providerTemplateId: string;
  bodyVariables: string[];
  fetchImpl?: typeof fetch;
}

/**
 * **EXPERIMENTAL** — validación empírica pendiente en smoke F.
 *
 * Carga PIT v2.0 + ghl_contact_id de la conversación, intenta enviar template
 * Meta vía POST /conversations/messages. Si falla con 4xx, el trainer recibe
 * un error claro indicándole que use YCloud o envío manual.
 */
async function sendViaGhl(
  params: SendViaGhlParams,
): Promise<{ providerMessageId: string; status?: string }> {
  const { supabase, tenantId, conversationId, providerTemplateId, bodyVariables, fetchImpl } =
    params;

  // a) Credenciales GHL (prefer PIT)
  const cred = await resolveGhlCredentials(supabase, tenantId, {
    warn: (o, msg) => logger.warn(o, msg),
    info: (o, msg) => logger.info(o, msg),
  });
  if (!cred.ok) {
    throw new WelcomeTemplateError(
      'no_provider_account',
      `tenant ${tenantId} sin credenciales GHL utilizables: ${cred.error}`,
      409,
    );
  }

  // b) ghl_contact_id de la conversación (poblado al recibir webhook GHL).
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, ghl_contact_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (convErr || !conv) {
    throw new WelcomeTemplateError(
      'lead_not_found',
      `conversation ${conversationId} no encontrada para tenant ${tenantId}`,
      404,
    );
  }
  const ghlContactId =
    typeof conv.ghl_contact_id === 'string' && conv.ghl_contact_id.length > 0
      ? conv.ghl_contact_id
      : '';
  if (!ghlContactId) {
    throw new WelcomeTemplateError(
      'lead_no_ghl_contact',
      `conversation ${conversationId} sin ghl_contact_id — primero contacta vía GHL para poblar el ID`,
      422,
    );
  }

  // c) Envío
  try {
    const result = await ghlSendTemplate({
      apiToken: cred.accessToken,
      contactId: ghlContactId,
      templateId: providerTemplateId,
      templateParams: bodyVariables,
      fetchImpl,
    });
    return { providerMessageId: result.providerMessageId };
  } catch (err) {
    if (err instanceof GhlTemplatesError) {
      throw new WelcomeTemplateError(
        'send_failed',
        `GHL sendTemplate failed: HTTP ${err.status} — ${err.snippet}`,
        502,
        err,
      );
    }
    throw err;
  }
}

interface TemplateVariableInput {
  name?: string | null;
  sample?: string | null;
}

interface LeadFieldsForTemplate {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  external_id?: string | null;
}

/**
 * Sustituye los placeholders `{{name}}` y `{{N}}` (posicional 1-indexed) en el
 * body de la plantilla por los valores reales del lead. Se usa solo para
 * persistir el mensaje en `conversation_messages.content` (la WA enviada por
 * Meta interpola via bodyVariables, no por nuestro body raw).
 *
 * Idempotente: si un placeholder no tiene match, se deja literal (mejor que
 * persistir vacío y perder contexto). Si el body no tiene placeholders, se
 * devuelve tal cual.
 */
export function interpolateTemplateBody(
  body: string,
  variables: TemplateVariableInput[],
  lead: LeadFieldsForTemplate,
): string {
  let out = body;
  variables.forEach((v, idx) => {
    const resolved = resolveTemplateVariable(v, lead);
    const positional = String(idx + 1);
    out = out.replace(
      new RegExp(`\\{\\{\\s*${escapeRegex(positional)}\\s*\\}\\}`, 'g'),
      resolved,
    );
    if (v?.name) {
      out = out.replace(
        new RegExp(`\\{\\{\\s*${escapeRegex(v.name)}\\s*\\}\\}`, 'g'),
        resolved,
      );
    }
  });
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fallback para un hueco de NOMBRE cuando el lead no trae ninguno.
 *
 * El `sample` de la plantilla NO sirve aquí: es el valor de ejemplo que el
 * entrenador puso para que Meta revisara la plantilla, y suele ser su propio
 * nombre. En la de Tania el sample es "Tania", así que un lead sin nombre
 * recibía "Hola Tania, soy Tânia Matos de Cuida tu Espalda" — la entrenadora
 * saludándose a sí misma.
 *
 * Tampoco vale la cadena vacía: la documentación de Meta no garantiza que un
 * parámetro vacío sea válido (sí prohíbe saltos de línea, tabuladores y más de
 * 4 espacios seguidos), y un envío rechazado pierde el lead entero. Se usa un
 * saludo neutro que encaja en el patrón "Hola {{nombre}}," de las plantillas de
 * bienvenida: "Hola buenas, soy Tânia Matos…" se lee natural.
 *
 * Si una plantilla usara otro patrón ("Estimado {{nombre}}"), este fallback
 * quedaría raro — pero solo en el caso ya de por sí anómalo de un formulario
 * que pide el nombre y llega sin él.
 */
const NOMBRE_FALLBACK = 'buenas';

/**
 * Mapea una variable de plantilla (`{name, sample}`) al campo correspondiente
 * del lead.
 *
 * Regla dura (2026-08-25): para las variables que SÍ mapean a un campo del lead,
 * el `sample` nunca se usa como dato de runtime — es un ejemplo de revisión de
 * Meta, no información de esta persona. Solo las variables desconocidas (que no
 * sabemos de dónde sacar) caen al sample.
 *
 * Soporta nombres comunes en español e inglés porque YCloud preserva el
 * placeholder original de Meta — el trainer puede haber escrito `{{nombre}}`
 * o `{{first_name}}`.
 */
export function resolveTemplateVariable(
  v: TemplateVariableInput,
  lead: LeadFieldsForTemplate,
): string {
  const name = (v?.name ?? '').toLowerCase().trim();
  const sample = v?.sample ?? '';
  if (!name) return sample;

  /** Vacío o solo espacios cuenta como "no hay dato". */
  const usable = (s: string | null | undefined): string | null => {
    const t = (s ?? '').trim();
    return t.length > 0 ? t : null;
  };

  switch (name) {
    case 'first_name':
    case 'firstname':
    case 'nombre':
    case '1': // {{1}} posicional clásico Meta
      return usable(lead.first_name) ?? NOMBRE_FALLBACK;
    case 'last_name':
    case 'lastname':
    case 'apellido':
    case 'apellidos':
    case '2':
      return usable(lead.last_name) ?? NOMBRE_FALLBACK;
    case 'phone':
    case 'telefono':
    case 'teléfono':
    case 'tel':
      // El teléfono siempre existe (el endpoint lo exige), pero si faltara, el
      // sample sería un número de ejemplo ajeno: mejor vacío que el de otro.
      return usable(lead.phone) ?? usable(lead.external_id) ?? '';
    case 'full_name':
    case 'fullname':
    case 'nombre_completo':
      return (
        [usable(lead.first_name), usable(lead.last_name)].filter(Boolean).join(' ') ||
        NOMBRE_FALLBACK
      );
    default:
      // Variable que no sabemos mapear: el sample es lo único que hay.
      return sample;
  }
}
