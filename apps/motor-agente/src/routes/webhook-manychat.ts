import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { parseManyChatInbound } from '@fyzon/channel-adapters';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import { touchIntegrationLastWebhook } from '../lib/touch-integration.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  insertInboundMessage,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';
import {
  classifyInboundOnly,
  loadAutomationKeywords,
} from '../services/ghl-message-router.js';

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

      // 1. Resolver tenant por token (filtrado por purpose='manychat_webhook')
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'manychat_webhook');
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

      // 4.7. Sprint Iota.3 (Iván 2026-05-12) + Iván (2026-05-25) — Gate
      // manychat_inbound_mode análogo a `ghl_inbound_mode='classified_only'`.
      //
      // Si conv NO tiene `conversation_source` clasificada y el modo es
      // 'classified_only':
      //   a) Intentar matchear el texto del inbound contra keywords
      //      type='inbound' del tenant. Si matchea → setear
      //      conversation_source='inbound' y continuar (IA entra).
      //   b) Si no matchea → pausar IA infinity. Lead + mensaje quedan
      //      persistidos para que el trainer los vea en panel, pero pipeline
      //      NO dispara. Trainer activa IA manual si decide responder.
      //
      // Doctrina unificada: tras un GDPR delete + re-write del mismo
      // subscriber_id, el motor crea lead+conv nuevos sin source → bajo este
      // gate la IA queda pausada (a) o se reclasifica (b) según contenido.
      const { data: cfg } = await supabase
        .from('tenant_configs')
        .select('manychat_inbound_mode')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const manychatMode =
        ((cfg as { manychat_inbound_mode?: string } | null)?.manychat_inbound_mode) ??
        'classified_only';
      if (manychatMode === 'classified_only') {
        const { data: convCheck } = await supabase
          .from('conversations')
          .select('conversation_source, ai_paused_until')
          .eq('id', conversationId)
          .maybeSingle();
        const row = convCheck as
          | { conversation_source: string | null; ai_paused_until: string | null }
          | null;
        if (row && row.conversation_source == null && row.ai_paused_until == null) {
          const inboundText = typeof message.text === 'string' ? message.text : '';
          let classifiedByInboundKeyword: 'inbound' | null = null;
          if (inboundText.trim().length > 0) {
            const keywords = await loadAutomationKeywords(supabase, tenantId);
            classifiedByInboundKeyword = classifyInboundOnly(inboundText, keywords);
          }
          if (classifiedByInboundKeyword === 'inbound') {
            await supabase
              .from('conversations')
              .update({ conversation_source: 'inbound' })
              .eq('id', conversationId);
            request.log.info(
              { tenantId, conversationId, mode: manychatMode },
              'webhook-manychat: inbound matched keyword type=inbound — conv clasificada inbound, IA activa',
            );
          } else {
            await supabase
              .from('conversations')
              .update({ ai_paused_until: 'infinity' })
              .eq('id', conversationId);
            request.log.info(
              { tenantId, conversationId, mode: manychatMode },
              'webhook-manychat: conv sin source clasificada — IA pausada (classified_only)',
            );
            // 5b. Toca last_webhook_at + ack 200 sin encolar debounce.
            await touchIntegrationLastWebhook(supabase, tenantId, 'manychat');
            return reply.code(200).send({
              ack: true,
              deduped: false,
              tenant_id: tenantId,
              lead_id: leadId,
              conversation_id: conversationId,
              message_id: messageId,
              skipped: 'manychat_inbound_classified_only',
              received_at: new Date().toISOString(),
            });
          }
        }
      }

      // 5. Encolar/extender debounce: el cron levantará el pipeline al expirar.
      try {
        const debounceWindowSeconds = await loadDebounceWindow(supabase, tenantId);
        await enqueueDebounce(getRedis(), conversationId, debounceWindowSeconds);
      } catch (err) {
        // No bloqueamos el ack si Redis está caído — el motor sigue persistiendo.
        request.log.warn({ err }, 'enqueueDebounce failed (non-fatal)');
      }

      // 5b. Toca last_webhook_at para el dashboard /settings/integrations/health.
      await touchIntegrationLastWebhook(supabase, tenantId, 'manychat');

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
