import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { parseManyChatInbound } from '@fyzon/channel-adapters';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { enqueueDebounceOrDefer } from '../lib/debounce-buffer.js';
import { touchIntegrationLastWebhook } from '../lib/touch-integration.js';
import {
  findMessageByProviderId,
  getOrCreateChannel,
  getOrCreateConversation,
  insertInboundMessage,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';
import { getAnthropicForTenant } from '../lib/anthropic.js';
import {
  applyInboundIntentGate,
  parseInboundGateMode,
} from '../services/inbound-intent-gate.js';

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

      // 3.1. Antiduplicado en BD (2026-10-20, migration 080): sobrevive al TTL
      //      de Redis y a Redis caído. Solo si el payload trae timestamp (es lo
      //      único estable que manda ManyChat).
      const stored = await findMessageByProviderId(
        supabase,
        tenantId,
        'manychat',
        message.providerMessageId,
      );
      if (stored) {
        return reply.code(200).send({
          ack: true,
          deduped: true,
          tenant_id: tenantId,
          conversation_id: stored.conversationId,
        });
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

      const { messageId, duplicate } = await insertInboundMessage({
        supabase,
        tenantId,
        conversationId,
        message,
        provider: 'manychat',
      });
      if (duplicate) {
        return reply.code(200).send({
          ack: true,
          deduped: true,
          tenant_id: tenantId,
          conversation_id: conversationId,
        });
      }

      // 4.7. Gate de apertura. Sprint Iota.3 (Iván 2026-05-12) + Iván (2026-05-25)
      // + intención (2026-11-04, Tania). `manychat_inbound_mode` con la misma
      // semántica que `ghl_inbound_mode`: `all` no toca nada; `classified_only`
      // clasifica `inbound` si casa una palabra clave de ese tipo y si no pausa;
      // `classified_or_intent` además deja el botón y la palabra suelta sin
      // palabra clave a su flujo y manda al modelo el mensaje de 4+ palabras;
      // la palabra clave `inbound` suelta activa la IA en los dos modos (Iván
      // 4-nov). Solo actúa en el PRIMER mensaje
      // (sin origen ni pausa). Detalle en `services/inbound-intent-gate.ts`.
      //
      // Doctrina unificada: tras un GDPR delete + re-write del mismo
      // subscriber_id, el motor crea lead+conv nuevos sin source → pasan por
      // este gate otra vez.
      const { data: cfg } = await supabase
        .from('tenant_configs')
        .select('manychat_inbound_mode')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const manychatMode = parseInboundGateMode(
        (cfg as { manychat_inbound_mode?: unknown } | null)?.manychat_inbound_mode,
      );
      const gate = await applyInboundIntentGate({
        supabase,
        tenantId,
        conversationId,
        channelId,
        mode: manychatMode,
        text: message.text,
        provider: 'manychat',
        anthropic: () => getAnthropicForTenant(supabase, tenantId),
      });
      if (gate.evaluated && gate.paused) {
        // 5b. Toca last_webhook_at + ack 200 sin encolar debounce.
        await touchIntegrationLastWebhook(supabase, tenantId, 'manychat');
        return reply.code(200).send({
          ack: true,
          deduped: false,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId,
          message_id: messageId,
          skipped: `manychat_inbound_${manychatMode}`,
          gate_outcome: gate.outcome,
          received_at: new Date().toISOString(),
        });
      }

      // 5. Encolar/extender debounce: el cron levantará el pipeline al expirar.
      try {
        const debounceWindowSeconds = await loadDebounceWindow(supabase, tenantId);
        // Nunca lanza: si Redis no responde, se aplaza en memoria hasta que vuelva.
        await enqueueDebounceOrDefer(getRedis(), conversationId, debounceWindowSeconds);
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
