import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ManyChatInstagramAdapter,
  ManyChatWhatsAppAdapter,
  YCloudWhatsAppAdapter,
  type ChannelAdapter,
} from '@fyzon/channel-adapters';
import {
  MAX_RETRY_ATTEMPTS,
  markScheduleFailed,
  markScheduleSent,
  nextRetryAt,
  rescheduleForRetry,
} from './scheduler.js';
import { env } from '../config/env.js';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';

type SupportedProvider = 'manychat' | 'ycloud';

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
    .select('id, tenant_id, conversation_id, integration_account_id, message, attempts, scheduled_at')
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

  // 2. Marcar como processing
  const ids = candidates.map((c) => Number(c.id));
  await supabase.from('message_schedules').update({ status: 'processing' }).in('id', ids);

  // 3. Procesar uno a uno
  for (const row of candidates) {
    const scheduleId = Number(row.id);
    const messageText = String(row.message ?? '');
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

    try {
      // Cargar credenciales + canal + provider + lead
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

      // Marca enviado + replica como conversation_messages source='ai'
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
      'id, provider, credentials, credentials_encrypted, connection_config, channel_id, channels(channel_type)',
    )
    .eq('id', params.integrationAccountId)
    .maybeSingle();
  if (iaErr || !ia) {
    throw new Error(`integration_account ${params.integrationAccountId} no encontrado`);
  }
  const credentials = decodeCredentialsRow(ia, params.integrationAccountId);
  const apiKey = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  if (!apiKey) {
    throw new Error(`integration_account ${params.integrationAccountId} sin api_key`);
  }

  const provider = normalizeProvider(typeof ia.provider === 'string' ? ia.provider : 'manychat');

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
  if (value === 'manychat' || value === 'ycloud') return value;
  // 'meta_cloud', 'ghl', 'other' → no soportados todavía en outbound. Default a manychat
  // como comportamiento histórico hasta tener adapters dedicados.
  throw new Error(`provider '${value}' no soportado por outbound-sender (use manychat o ycloud)`);
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
  }
  // Exhaustiveness — TS debería detectar si añadimos nuevo provider sin caso aquí.
  throw new Error(`provider '${ctx.provider}' sin adapter implementado`);
}

export const _internal = {
  buildAdapter,
  loadSendContext,
  MAX_RETRY_ATTEMPTS,
};
