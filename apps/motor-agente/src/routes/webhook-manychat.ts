import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { parseManyChatInbound } from '@fyzon/channel-adapters';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  insertInboundMessage,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';

const DEFAULT_DEBOUNCE_SECONDS = 25;

async function loadDebounceWindow(supabase: ReturnType<typeof getSupabase>, tenantId: number): Promise<number> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('debounce_window_seconds')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return DEFAULT_DEBOUNCE_SECONDS;
  const v = Number(data.debounce_window_seconds);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DEBOUNCE_SECONDS;
}

interface WebhookParams {
  tenant_token: string;
}

export async function webhookManyChatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: WebhookParams; Body: unknown }>(
    '/webhook/manychat/:tenant_token',
    async (request: FastifyRequest<{ Params: WebhookParams; Body: unknown }>, reply: FastifyReply) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();

      // 1. Resolver tenant por token
      const resolved = await resolveTenantByToken(supabase, tenant_token);
      if (!resolved) {
        return reply.code(404).send({ error: 'tenant_token invalid or inactive' });
      }
      const { tenantId } = resolved;

      // 2. Parsear payload con Zod
      let parseResult;
      try {
        parseResult = parseManyChatInbound(request.body, tenantId);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid payload', issues: err.flatten() });
        }
        throw err;
      }
      const { payload, message } = parseResult;

      // 3. Deduplicar en Redis por (tenant_id, subscriber_id, timestamp_ms)
      const dedupKey = `manychat:${tenantId}:${message.externalUserId}:${message.timestampMs}`;
      const claimed = await tryClaimDedupKey(dedupKey, 60);
      if (!claimed) {
        return reply
          .code(200)
          .send({ ack: true, deduped: true, tenant_id: tenantId });
      }

      // 4. Canal + lead + conversacion + mensaje
      const { channelId } = await getOrCreateChannel({
        supabase,
        tenantId,
        channelType: message.channel,
        viaProvider: 'manychat',
      });

      const { leadId } = await upsertLead({
        supabase,
        tenantId,
        channelId,
        externalId: message.externalUserId,
        firstName: payload.subscriber.first_name ?? null,
        lastName: payload.subscriber.last_name ?? null,
        phone: payload.subscriber.phone ?? null,
        email: payload.subscriber.email ?? null,
        username: payload.subscriber.username ?? null,
      });

      const { conversationId } = await getOrCreateConversation({
        supabase,
        tenantId,
        leadId,
        channelId,
      });

      const { messageId } = await insertInboundMessage({
        supabase,
        tenantId,
        conversationId,
        message,
      });

      // 5. Encolar/extender debounce: el cron levantará el pipeline al expirar.
      try {
        const debounceWindowSeconds = await loadDebounceWindow(supabase, tenantId);
        await enqueueDebounce(getRedis(), conversationId, debounceWindowSeconds);
      } catch (err) {
        // No bloqueamos el ack si Redis está caído — el motor sigue persistiendo.
        request.log.warn({ err }, 'enqueueDebounce failed (non-fatal)');
      }

      // 6. Ack a ManyChat. El pipeline + outbound suceden out-of-band tras el debounce.
      return reply.code(200).send({
        ack: true,
        deduped: false,
        tenant_id: tenantId,
        lead_id: leadId,
        conversation_id: conversationId,
        message_id: messageId,
        received_at: new Date().toISOString(),
      });
    },
  );
}
