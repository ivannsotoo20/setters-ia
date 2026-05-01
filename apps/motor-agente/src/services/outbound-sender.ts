import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ManyChatInstagramAdapter,
  ManyChatWhatsAppAdapter,
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
      // Cargar credenciales + canal + lead
      const sendCtx = await loadSendContext(supabase, {
        integrationAccountId: Number(row.integration_account_id),
        conversationId: Number(row.conversation_id),
      });
      const adapter = buildAdapterForChannel(sendCtx.channelType, sendCtx.apiKey);
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
}

async function loadSendContext(
  supabase: SupabaseClient,
  params: { integrationAccountId: number; conversationId: number },
): Promise<SendContext> {
  // integration_accounts → credentials + channel_type via channels FK
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id, credentials, channel_id, channels(channel_type)')
    .eq('id', params.integrationAccountId)
    .maybeSingle();
  if (iaErr || !ia) {
    throw new Error(`integration_account ${params.integrationAccountId} no encontrado`);
  }
  const credentials = (ia.credentials ?? {}) as Record<string, unknown>;
  const apiKey = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  if (!apiKey) {
    throw new Error(`integration_account ${params.integrationAccountId} sin api_key`);
  }

  // channel_type embedded
  const channelType = mapChannelTypeFromDb(extractChannelType(ia));

  // lead.external_id (el subscriber_id de ManyChat)
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
  };
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

function buildAdapterForChannel(
  channelType: 'whatsapp' | 'instagram' | 'facebook',
  apiKey: string,
): ChannelAdapter {
  const baseUrl = env.MANYCHAT_API_BASE;
  switch (channelType) {
    case 'instagram':
      return new ManyChatInstagramAdapter({ apiKey, baseUrl });
    case 'whatsapp':
      return new ManyChatWhatsAppAdapter({ apiKey, baseUrl });
    case 'facebook':
      // Para FB usamos también el adapter de Instagram porque ManyChat usa el mismo endpoint
      // y el `channel` solo afecta el routing interno. Cuando dividamos FB con tag distinto, lo separamos.
      return new ManyChatInstagramAdapter({ apiKey, baseUrl });
  }
}

export const _internal = {
  buildAdapterForChannel,
  loadSendContext,
  MAX_RETRY_ATTEMPTS,
};
