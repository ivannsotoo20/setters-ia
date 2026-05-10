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
import { ycloudSendTemplate, YCloudTemplatesError } from '@fyzon/channel-adapters';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export type WelcomeTemplateErrorReason =
  | 'template_not_found'
  | 'template_not_supported'
  | 'lead_not_found'
  | 'lead_no_phone'
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
  if (provider !== 'ycloud' && provider !== 'meta_cloud') {
    throw new WelcomeTemplateError(
      'template_not_supported',
      `template ${templateId} provider='${provider}' — solo ycloud/meta_cloud`,
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

  // 3) integration_account ycloud activa del tenant.
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
  const apiKey = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  if (!apiKey) {
    throw new WelcomeTemplateError(
      'no_api_key',
      `integration_account ${integrationAccountId} (ycloud) sin api_key`,
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

  // 4) bodyVariables: por defecto rellenar con `sample` de cada variable.
  //    El trainer puede registrar variables con sample = primer_nombre, etc. En
  //    sub-fase futura, opcionalmente sustituir samples por datos reales del lead.
  const variables = Array.isArray(template.variables)
    ? (template.variables as Array<{ sample?: string | null }>)
    : [];
  const bodyVariables = variables
    .map((v) => v?.sample ?? '')
    .filter((s): s is string => typeof s === 'string');

  // 5) Send via YCloud.
  let sendResult;
  try {
    sendResult = await ycloudSendTemplate({
      apiKey,
      from: businessPhone,
      to: toPhone,
      templateName: providerTemplateId,
      language,
      bodyVariables,
      baseUrl: env.YCLOUD_API_BASE,
      fetchImpl,
    });
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

  // 6) Persistir mensaje + actualizar conversation a F1 outbound bienvenida + activar IA.
  const sentAt = new Date().toISOString();
  const bodyText =
    typeof template.body === 'string' && template.body.trim().length > 0
      ? template.body
      : `[template:${providerTemplateId}]`;

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
      providerMessageId: sendResult.providerMessageId,
    },
    'sendWelcomeTemplate: bienvenida WA enviada via YCloud',
  );

  return {
    providerMessageId: sendResult.providerMessageId,
    status: sendResult.status,
    templateName: providerTemplateId,
    bodyText,
  };
}
