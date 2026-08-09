import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import {
  GhlChannelAdapter,
  ManyChatInstagramAdapter,
  ManyChatWhatsAppAdapter,
  YCloudWhatsAppAdapter,
  ycloudSendTemplate,
  type ChannelAdapter,
} from '@fyzon/channel-adapters';
import {
  MAX_RETRY_ATTEMPTS,
  markScheduleFailed,
  markScheduleSent,
  nextRetryAt,
  rescheduleForRetry,
} from './scheduler.js';
import { personalizeFollowupMessage } from './personalize-followup.js';
import { getAnthropic } from '../lib/anthropic.js';
import { env } from '../config/env.js';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { isAiPausedFromDb } from '../lib/ai-pause.js';
import { logger } from '../lib/logger.js';
import { getValidAccessToken, GhlOauthError } from '../lib/ghl-oauth.js';

type SupportedProvider = 'manychat' | 'ycloud' | 'ghl';

export type ConvState = {
  id: number;
  state: string;
  is_blocked: boolean;
  ai_paused_until: string | null;
};

/**
 * Sprint Iota.3 hotfix — decide si un outbound schedule debe enviarse o cancelarse
 * en función del estado de su conversación. Doctrina: "IA pausada/bloqueada/cerrada
 * = motor NO envía". Si devuelve string → razón de cancelación. Si null → enviar.
 *
 * Aplica a CUALQUIER tipo de schedule outbound (follow_up, message, resource).
 * Antes solo se evaluaba en inbound (pipeline Generator); los FUs programados
 * salían aunque el trainer hubiera pausado la IA.
 */
export function outboundGateSkipReason(
  cv: ConvState | undefined,
  opts?: { skipPauseCheck?: boolean },
): string | null {
  if (!cv) return 'conv not found';
  if (cv.state === 'closed') return 'conv state=closed';
  if (cv.is_blocked) return 'conv is_blocked';
  // Hito 10.6.1 — si el schedule pertenece al turno actual del bot ('ai_turn')
  // o es manual del trainer, NO bloquear por ai_paused_until. Esto permite que
  // las partes ya generadas se envíen aunque la IA se haya pausado durante el
  // mismo turno (caso típico: API booking inline pausa IA tras crear cita).
  if (!opts?.skipPauseCheck && isAiPausedFromDb(cv.ai_paused_until)) return 'ai paused';
  return null;
}

export interface SendBatchDeps {
  supabase: SupabaseClient;
}

export interface SendBatchResult {
  picked: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  details: Array<{
    scheduleId: number;
    status: 'sent' | 'retried' | 'failed' | 'skipped';
    error?: string;
  }>;
}

const MAX_BATCH_SIZE = 25;

/**
 * Lee mensajes pending vencidos y los envía vía adapter ManyChat.
 *
 * Estrategia anti-concurrencia (MVP): primero `UPDATE ... WHERE status='pending' AND scheduled_at <= NOW()`
 * cambiando a status='processing'. Esto da exclusividad si en el futuro
 * arrancamos varios workers (race-free dentro del transaction de Postgres).
 */
export async function sendNextBatch(
  deps: SendBatchDeps,
  batchSize = MAX_BATCH_SIZE,
): Promise<SendBatchResult> {
  const { supabase } = deps;

  // 1. Pick batch de pending vencidos
  const nowIso = new Date().toISOString();
  const { data: candidates, error: pickErr } = await supabase
    .from('message_schedules')
    .select(
      `id, tenant_id, conversation_id, integration_account_id, message, attempts, scheduled_at,
       message_type, template_id, ai_personalize, ai_guide, triggered_by`,
    )
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(batchSize);
  if (pickErr) {
    throw new Error(`sendNextBatch pick: ${pickErr.message}`);
  }

  const result: SendBatchResult = {
    picked: candidates?.length ?? 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  if (!candidates || candidates.length === 0) return result;

  // 1.5 Interruptor global por entrenador (migration 074).
  //
  // Este tick pesca pendientes de TODOS los tenants, así que hay que descartar
  // los de quien tenga el setter apagado. Sin esto, apagar el interruptor
  // seguiría soltando durante los segundos siguientes las partes ya programadas
  // del último turno: el entrenador ve que "sigue escribiendo" después de
  // haberlo parado, y deja de fiarse del botón.
  //
  // Los schedules NO se cancelan, se dejan en `pending`: si vuelve a encender en
  // un rato, la conversación continúa donde estaba en vez de quedarse coja.
  let pending = candidates;
  const tenantIdsInBatch = [...new Set(pending.map((c) => Number(c.tenant_id)))];
  const { data: disabledRows } = await supabase
    .from('tenant_configs')
    .select('tenant_id')
    .in('tenant_id', tenantIdsInBatch)
    .eq('ai_enabled', false);
  const disabledTenants = new Set((disabledRows ?? []).map((r) => Number(r.tenant_id)));

  if (disabledTenants.size > 0) {
    const before = pending.length;
    pending = pending.filter((c) => !disabledTenants.has(Number(c.tenant_id)));
    const dropped = before - pending.length;
    result.skipped += dropped;
    result.picked = pending.length;
    logger.info(
      { tenants: [...disabledTenants], dropped },
      'sendNextBatch: partes omitidas por interruptor global apagado (siguen pending)',
    );
    if (pending.length === 0) return result;
  }

  // 2. Marcar como processing
  const ids = pending.map((c) => Number(c.id));
  await supabase.from('message_schedules').update({ status: 'processing' }).in('id', ids);

  // 2.5 Sprint Iota.3 hotfix CRÍTICO (2026-05-12) — gate IA pausada en outbound.
  //
  // BUG previo: outbound-sender pescaba schedules pending y los enviaba SIN
  // mirar `conversations.ai_paused_until`, `is_blocked` ni `state`. Resultado:
  // si el trainer pausaba la IA después de que el panel materializara un FU,
  // el motor enviaba el mensaje pausado igual. Violación del contrato
  // "IA pausada = IA no escribe". Confirmado en prod 2026-05-12:
  // schedules 143/141/146 enviados a Celebraciones, francisco, Jony con
  // ai_paused_until='9999-12-31'.
  //
  // Fix: cargar estado de cada conv del batch en una sola query, y para los
  // schedules cuyas convs estén pausadas/bloqueadas/cerradas, marcarlos
  // 'cancelled' con last_error y saltarlos del envío.
  const convIds = Array.from(new Set(pending.map((c) => Number(c.conversation_id))));
  const { data: convStatesRaw } = await supabase
    .from('conversations')
    .select('id, state, is_blocked, ai_paused_until')
    .in('id', convIds);
  const convMap = new Map<number, ConvState>();
  for (const r of (convStatesRaw ?? []) as ConvState[]) {
    convMap.set(Number(r.id), r);
  }

  const cancelledIds: number[] = [];
  const sendableCandidates: typeof pending = [];
  for (const row of pending) {
    const cv = convMap.get(Number(row.conversation_id));
    const triggeredBy = (row.triggered_by as string | null | undefined) ?? null;
    // Hito 10.6.1 fix — partes del turno del bot (triggered_by='ai_turn') NO
    // se cancelan aunque la IA esté pausada. Caso típico: API booking inline
    // pausa IA infinity tras crear cita, pero las partes "Listo te apunto..."
    // aún tienen que enviarse al lead. Igual aplica a partes manuales
    // ('manual') que el trainer puede haber enviado desde panel — esas las
    // dejamos siempre.
    const isImmediateTurnPart = triggeredBy === 'ai_turn' || triggeredBy === 'manual';
    const reason = outboundGateSkipReason(cv, { skipPauseCheck: isImmediateTurnPart });
    if (reason) {
      cancelledIds.push(Number(row.id));
      result.skipped++;
      result.details.push({ scheduleId: Number(row.id), status: 'skipped', error: reason });
      continue;
    }
    sendableCandidates.push(row);
  }

  if (cancelledIds.length > 0) {
    await supabase
      .from('message_schedules')
      .update({
        status: 'cancelled',
        last_error: 'outbound gate: conv paused/blocked/closed',
      })
      .in('id', cancelledIds);
  }

  // 3. Procesar uno a uno (solo los que pasaron el gate)
  for (const row of sendableCandidates) {
    const scheduleId = Number(row.id);
    let messageText = String(row.message ?? '');
    const messageType = String(row.message_type ?? 'message');
    const templateId = row.template_id != null ? Number(row.template_id) : null;
    const aiPersonalize = Boolean(row.ai_personalize);
    const aiGuide = (row.ai_guide as string | null) ?? null;

    try {
      // 3.a) AI-personalize: el panel pre-genera al materializar (Sprint Iota.1.e)
      // → si messageText ya existe, NO regeneramos (preview = realidad enviada).
      // Solo regeneramos como fallback si materialize falló (message_text=null).
      if (
        messageType === 'follow_up' &&
        aiPersonalize &&
        aiGuide &&
        (!messageText || messageText.trim().length === 0)
      ) {
        const anthropic = getAnthropic();
        const personalized = await personalizeFollowupMessage({
          supabase,
          anthropic: anthropic as unknown as Anthropic,
          conversationId: Number(row.conversation_id),
          aiGuide,
        });
        if (!personalized.ok) {
          throw new Error(`AI-personalize fallback: ${personalized.error}`);
        }
        messageText = personalized.message;
        await supabase
          .from('message_schedules')
          .update({ message: messageText })
          .eq('id', scheduleId);
      }

      // 3.b) WA template via YCloud: enviar template message
      if (messageType === 'follow_up' && templateId != null) {
        const sendCtx = await loadSendContext(supabase, {
          integrationAccountId: Number(row.integration_account_id),
          conversationId: Number(row.conversation_id),
        });

        const { data: tpl } = await supabase
          .from('followup_templates')
          .select('provider, provider_template_id, language, variables')
          .eq('id', templateId)
          .maybeSingle();
        if (
          tpl &&
          (tpl.provider === 'ycloud' || tpl.provider === 'meta_cloud') &&
          sendCtx.provider === 'ycloud' &&
          sendCtx.businessPhone
        ) {
          const variables = Array.isArray(tpl.variables)
            ? (tpl.variables as Array<{ sample?: string | null }>)
            : [];
          const bodyVariables = variables
            .map((v) => v.sample)
            .filter((s): s is string => typeof s === 'string' && s.length > 0);
          const sendResult = await ycloudSendTemplate({
            apiKey: sendCtx.apiKey,
            from: sendCtx.businessPhone,
            to: sendCtx.externalUserId,
            templateName: String(tpl.provider_template_id),
            language: String(tpl.language ?? 'es'),
            bodyVariables,
            baseUrl: env.YCLOUD_API_BASE,
          });
          await markScheduleSent({
            supabase,
            scheduleId,
            providerMessageId: sendResult.providerMessageId,
          });
          await supabase.from('conversation_messages').insert({
            tenant_id: Number(row.tenant_id),
            conversation_id: Number(row.conversation_id),
            source: 'ai',
            content_type: 'text',
            content: messageText || `[template:${tpl.provider_template_id}]`,
            sent_at: new Date().toISOString(),
          });
          result.sent++;
          result.details.push({ scheduleId, status: 'sent' });
          continue;
        }
      }

      if (!messageText.trim()) {
        await markScheduleFailed({
          supabase,
          scheduleId,
          attempts: Number(row.attempts) + 1,
          error: 'message empty',
        });
        result.skipped++;
        result.details.push({ scheduleId, status: 'skipped', error: 'message empty' });
        continue;
      }

      // 3.c) Path normal: cargar credenciales + adapter + send text
      const sendCtx = await loadSendContext(supabase, {
        integrationAccountId: Number(row.integration_account_id),
        conversationId: Number(row.conversation_id),
      });
      const adapter = buildAdapter(sendCtx);
      const sendResult = await adapter.send({
        tenantId: String(row.tenant_id),
        externalUserId: sendCtx.externalUserId,
        channel: sendCtx.channelType,
        text: messageText,
      });

      await markScheduleSent({
        supabase,
        scheduleId,
        providerMessageId: sendResult.providerMessageId,
      });
      await supabase.from('conversation_messages').insert({
        tenant_id: Number(row.tenant_id),
        conversation_id: Number(row.conversation_id),
        source: 'ai',
        content_type: 'text',
        content: messageText,
        sent_at: new Date().toISOString(),
      });

      result.sent++;
      result.details.push({ scheduleId, status: 'sent' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newAttempts = Number(row.attempts) + 1;
      const next = nextRetryAt(newAttempts);
      if (next) {
        await rescheduleForRetry({
          supabase,
          scheduleId,
          attempts: newAttempts,
          nextAt: next,
          error: message,
        });
        result.retried++;
        result.details.push({ scheduleId, status: 'retried', error: message });
      } else {
        await markScheduleFailed({
          supabase,
          scheduleId,
          attempts: newAttempts,
          error: message,
        });
        result.failed++;
        result.details.push({ scheduleId, status: 'failed', error: message });
      }
    }
  }

  return result;
}

interface SendContext {
  apiKey: string;
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  externalUserId: string;
  provider: SupportedProvider;
  /** Para YCloud: número del business en E.164 (de connection_config.business_phone). */
  businessPhone?: string;
}

async function loadSendContext(
  supabase: SupabaseClient,
  params: { integrationAccountId: number; conversationId: number },
): Promise<SendContext> {
  // integration_accounts → (credentials | credentials_encrypted) + provider +
  // connection_config + channel_type via channels FK.
  // `decodeCredentialsRow` prefiere `credentials_encrypted` (Hardening 1.1) y
  // hace fallback a `credentials` plain mientras dura la transición.
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select(
      'id, tenant_id, provider, credentials, credentials_encrypted, connection_config, channel_id, channels(channel_type)',
    )
    .eq('id', params.integrationAccountId)
    .maybeSingle();
  if (iaErr || !ia) {
    throw new Error(`integration_account ${params.integrationAccountId} no encontrado`);
  }
  const credentials = decodeCredentialsRow(ia, params.integrationAccountId);
  const provider = normalizeProvider(typeof ia.provider === 'string' ? ia.provider : 'manychat');
  // GHL usa `apiToken` (PIT), ManyChat/YCloud usan `api_key`. Ambos se mapean
  // al mismo campo SendContext.apiKey para uniformidad del adapter switch.
  // Hito 9 (2026-05-16) — fallback `apiKey` (camelCase) antes de `api_key`
  // (snake_case) para alinear con lo que el panel persiste vía wizard onboarding
  // (apps/panel/lib/actions/integrations.ts). Mismo patrón que send-welcome-template.ts:188.
  let apiKey =
    provider === 'ghl'
      ? typeof credentials.apiToken === 'string'
        ? credentials.apiToken
        : typeof credentials.accessToken === 'string' // OAuth shape
          ? credentials.accessToken
          : ''
      : typeof credentials.apiKey === 'string' && credentials.apiKey.length > 0
        ? credentials.apiKey
        : typeof credentials.api_key === 'string'
          ? credentials.api_key
          : '';

  // Sprint Iota.5 PR-B: si la row GHL es OAuth, asegurar token fresco
  // (auto-refresh si quedan <5min). `getValidAccessToken` también persiste
  // los tokens nuevos. Si es PIT, el apiToken pegado no requiere refresh.
  if (provider === 'ghl') {
    const cc = (ia.connection_config ?? {}) as { auth_type?: string };
    if (cc.auth_type === 'oauth') {
      try {
        const refreshed = await getValidAccessToken(supabase, Number(ia.tenant_id));
        apiKey = refreshed.accessToken;
      } catch (err) {
        if (!(err instanceof GhlOauthError)) throw err;
        // Si el refresh falla (clientId/secret no configurados, refresh_token
        // revocado, etc.) y NO tenemos apiKey usable del decifrado original,
        // propagamos el error. Si sí tenemos uno (legacy plain), seguimos con
        // ese — degraded mode hasta que el trainer reautorice.
        if (!apiKey) throw err;
      }
    }
  }

  if (!apiKey) {
    throw new Error(
      `integration_account ${params.integrationAccountId} (${provider}) sin token (api_key/apiKey/apiToken)`,
    );
  }

  // connection_config (no encriptado): para YCloud trae business_phone
  const connectionConfig = (ia.connection_config ?? {}) as Record<string, unknown>;
  const businessPhone =
    typeof connectionConfig.business_phone === 'string'
      ? connectionConfig.business_phone
      : undefined;

  // channel_type embedded
  const channelType = mapChannelTypeFromDb(extractChannelType(ia));

  // lead.external_id (subscriber_id ManyChat o wa_id YCloud)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, lead_id')
    .eq('id', params.conversationId)
    .maybeSingle();
  if (convErr || !conv) throw new Error(`conversation ${params.conversationId} no encontrado`);
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, external_id')
    .eq('id', Number(conv.lead_id))
    .maybeSingle();
  if (leadErr || !lead) throw new Error(`lead ${conv.lead_id} no encontrado`);

  return {
    apiKey,
    channelType,
    externalUserId: String(lead.external_id),
    provider,
    businessPhone,
  };
}

function normalizeProvider(value: string): SupportedProvider {
  if (value === 'manychat' || value === 'ycloud' || value === 'ghl') return value;
  throw new Error(
    `provider '${value}' no soportado por outbound-sender (use manychat, ycloud o ghl)`,
  );
}

function extractChannelType(row: Record<string, unknown>): string {
  const ch = row.channels;
  if (Array.isArray(ch) && ch.length > 0) {
    const first = ch[0] as Record<string, unknown>;
    if (typeof first.channel_type === 'string') return first.channel_type;
  }
  if (ch && typeof (ch as Record<string, unknown>).channel_type === 'string') {
    return (ch as Record<string, unknown>).channel_type as string;
  }
  return 'whatsapp';
}

function mapChannelTypeFromDb(dbType: string): 'whatsapp' | 'instagram' | 'facebook' {
  switch (dbType) {
    case 'instagram_dm':
      return 'instagram';
    case 'facebook_messenger':
      return 'facebook';
    case 'whatsapp':
    default:
      return 'whatsapp';
  }
}

/**
 * Construye el adapter outbound correcto según el provider del integration_account.
 *
 * - `manychat`: usa adapter ManyChat por canal (WA / IG / FB todos vía sendContent).
 * - `ycloud`: usa YCloudWhatsAppAdapter — solo WhatsApp. Si el canal no es WA, error.
 */
function buildAdapter(ctx: SendContext): ChannelAdapter {
  switch (ctx.provider) {
    case 'manychat': {
      const baseUrl = env.MANYCHAT_API_BASE;
      switch (ctx.channelType) {
        case 'instagram':
          return new ManyChatInstagramAdapter({ apiKey: ctx.apiKey, baseUrl });
        case 'whatsapp':
          return new ManyChatWhatsAppAdapter({ apiKey: ctx.apiKey, baseUrl });
        case 'facebook':
          // ManyChat usa el mismo endpoint para FB; reutilizamos el adapter de IG.
          return new ManyChatInstagramAdapter({ apiKey: ctx.apiKey, baseUrl });
      }
      break;
    }
    case 'ycloud': {
      if (ctx.channelType !== 'whatsapp') {
        throw new Error(`YCloud solo soporta WhatsApp, channel='${ctx.channelType}' no válido`);
      }
      if (!ctx.businessPhone) {
        throw new Error('YCloud adapter requiere business_phone en integration_accounts.connection_config');
      }
      return new YCloudWhatsAppAdapter({
        apiKey: ctx.apiKey,
        businessPhone: ctx.businessPhone,
        baseUrl: env.YCLOUD_API_BASE,
      });
    }
    case 'ghl': {
      // GHL envía via canal nativo IG/FB Messenger/WhatsApp. apiKey aquí es el
      // PIT de la sub-cuenta. ZWSP se apendea automáticamente en sendMessageViaChannel.
      return new GhlChannelAdapter({
        apiToken: ctx.apiKey,
        channel: ctx.channelType,
      });
    }
  }
  // Exhaustiveness — TS debería detectar si añadimos nuevo provider sin caso aquí.
  throw new Error(`provider '${ctx.provider}' sin adapter implementado`);
}

export const _internal = {
  buildAdapter,
  loadSendContext,
  MAX_RETRY_ATTEMPTS,
};
