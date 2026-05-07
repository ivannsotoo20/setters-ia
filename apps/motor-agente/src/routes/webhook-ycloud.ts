import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { parseYCloudInbound } from '@fyzon/channel-adapters';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import { verifyYCloudSignature } from '../lib/webhook-verify.js';
import { env } from '../config/env.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  insertInboundMessage,
  resolveTenantByToken,
  upsertLead,
} from '../services/lead-ingest.js';

const DEFAULT_DEBOUNCE_SECONDS = 25;

async function loadDebounceWindow(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
): Promise<number> {
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

/**
 * Webhook receiver YCloud (WhatsApp BSP oficial Meta).
 *
 * Flujo:
 *  1. Resuelve tenant_token (purpose='ycloud_webhook')
 *  2. Parsea payload con Zod (acepta Meta-style y native YCloud)
 *  3. Si es status update (sent/delivered/read/failed) → 200 ack inmediato sin pipeline
 *  4. Si es mensaje del usuario:
 *      - Dedupe Redis con `parsed.dedupKey` (estable: usa wamid del mensaje)
 *      - Upsert canal (whatsapp via ycloud) + lead + conversación + mensaje
 *      - Encolar debounce (cron levantará el pipeline al expirar)
 *  5. 200 ack
 */
export async function webhookYCloudRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: WebhookParams; Body: unknown }>(
    '/webhook/ycloud/:tenant_token',
    async (
      request: FastifyRequest<{ Params: WebhookParams; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();

      // 1. Resolver tenant por token
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'ycloud_webhook');
      if (!resolved) {
        return reply.code(404).send({ error: 'tenant_token invalid or inactive' });
      }
      const { tenantId } = resolved;

      // 1.5. Verificar firma HMAC YCloud (Hardening 1.2)
      const verifyMode = env.YCLOUD_WEBHOOK_VERIFY_MODE;
      if (verifyMode !== 'disabled') {
        const sigHeader = pickHeader(request, 'ycloud-signature');
        const { data: ia } = await supabase
          .from('integration_accounts')
          .select('webhook_secret')
          .eq('tenant_id', tenantId)
          .eq('provider', 'ycloud')
          .eq('is_active', true)
          .maybeSingle();
        const webhookSecret = typeof ia?.webhook_secret === 'string' ? ia.webhook_secret : '';

        if (!webhookSecret) {
          request.log.warn(
            { tenantId, verifyMode },
            'webhook-ycloud: no webhook_secret configurado en integration_accounts',
          );
          if (verifyMode === 'enforce') {
            return reply.code(401).send({ error: 'webhook_secret not configured' });
          }
        } else {
          const rawBody =
            request.rawBody ??
            Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}), 'utf8');
          const verifyResult = verifyYCloudSignature({
            rawBody,
            signatureHeader: sigHeader,
            secret: webhookSecret,
          });
          if (!verifyResult.ok) {
            const reason = verifyResult.reason;
            request.log.warn(
              { tenantId, verifyMode, reason, hasSignature: Boolean(sigHeader) },
              `webhook-ycloud: signature verification failed (${reason})`,
            );
            if (verifyMode === 'enforce') {
              return reply.code(401).send({ error: 'invalid signature', reason });
            }
          } else {
            request.log.debug({ tenantId }, 'webhook-ycloud: signature OK');
          }
        }
      }

      // 2. Parsear payload con Zod (Meta-style o native)
      let parseResult;
      try {
        parseResult = parseYCloudInbound(request.body, tenantId);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid payload', issues: err.flatten() });
        }
        throw err;
      }

      const { message, isStatusUpdate, dedupKey } = parseResult;

      // 3. Status update → 200 ack sin pipeline
      if (isStatusUpdate) {
        return reply.code(200).send({ ack: true, status_update: true, tenant_id: tenantId });
      }

      // Si no es mensaje ni status (formato inesperado), también ack para no romper YCloud
      if (!message) {
        request.log.warn(
          { tenantId, dedupKey },
          'webhook-ycloud: payload no contiene mensaje ni status',
        );
        return reply.code(200).send({ ack: true, ignored: true, tenant_id: tenantId });
      }

      // 4. Deduplicar en Redis por dedupKey (estable, basado en wamid)
      const fullDedupKey = `ycloud:${tenantId}:${dedupKey ?? `${message.externalUserId}:${message.timestampMs}`}`;
      const claimed = await tryClaimDedupKey(fullDedupKey, 60);
      if (!claimed) {
        return reply.code(200).send({ ack: true, deduped: true, tenant_id: tenantId });
      }

      // 5. Canal + lead + conversación + mensaje
      const { channelId } = await getOrCreateChannel({
        supabase,
        tenantId,
        channelType: 'whatsapp',
        viaProvider: 'ycloud',
      });

      // Extraer nombre del contacto desde rawPayload (lo guardamos como first_name si vino)
      const raw = (message.rawPayload ?? {}) as Record<string, unknown>;
      const contactName = typeof raw.contactName === 'string' ? raw.contactName : null;

      const { leadId } = await upsertLead({
        supabase,
        tenantId,
        channelId,
        externalId: message.externalUserId,
        firstName: contactName,
        phone: message.externalUserId, // wa_id es el teléfono
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

      // 6. Encolar/extender debounce
      try {
        const debounceWindowSeconds = await loadDebounceWindow(supabase, tenantId);
        await enqueueDebounce(getRedis(), conversationId, debounceWindowSeconds);
      } catch (err) {
        request.log.warn({ err }, 'enqueueDebounce failed (non-fatal)');
      }

      // 7. Ack a YCloud
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

function pickHeader(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return undefined;
}
