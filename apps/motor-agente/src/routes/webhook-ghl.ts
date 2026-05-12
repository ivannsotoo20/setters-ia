import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  GhlParseError,
  parseGhlInboundMessage,
  parseGhlOutboundMessage,
  parseGhlWebhookPayload,
} from '@fyzon/channel-adapters';
import { GhlClient } from '@fyzon/ghl-client';
import { env } from '../config/env.js';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { getRedis, tryClaimDedupKey } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { verifyGhlSignature } from '../lib/webhook-verify-ghl.js';
import { verifyMarketplaceWebhook } from '../lib/webhook-verify-marketplace.js';
import { touchIntegrationLastWebhook } from '../lib/touch-integration.js';
import {
  routeGhlInbound,
  routeGhlOutbound,
} from '../services/ghl-message-router.js';
import {
  resolveTenantByOauthLocation,
  resolveTenantByToken,
} from '../services/lead-ingest.js';

const DEFAULT_DEBOUNCE_SECONDS = 25;

interface WebhookParams {
  tenant_token: string;
}

/**
 * Webhook receiver para integraciones (Bloque C.2 — origen GHL).
 *
 * Path mounting: `/integrations/webhook/...` (path neutro, sin "ghl" en URL).
 * Razón: el developer portal de GHL valida y RECHAZA cualquier redirect/webhook
 * URL que contenga "ghl" / "highlevel" — error "The redirect uri contains a
 * Highlevel reference. Please remove any Highlevel references to save."
 *
 * Recibe Inbound + Outbound de GHL Workflows. Para inbound: ingest + pipeline.
 * Para outbound: clasifica (ZWSP / keyword / humano) y opcionalmente pausa IA.
 *
 * Flujo:
 *   1. Resolver tenant por token (purpose='ghl_webhook')
 *   2. Verificar firma RSA si verify_mode != 'disabled'
 *   3. Cargar integration_account ghl + decodificar credentials → GhlClient
 *   4. Validar locationId del payload === connection_config.locationId
 *   5. Parsear payload + delegar al router
 *   6. 200 ack
 */
export async function webhookGhlRoutes(app: FastifyInstance): Promise<void> {
  // GET /integrations/webhook/:tenant_token/ping — endpoint de prueba para
  // "Test Webhook" en GHL Workflow setup. Resuelve tenant, devuelve 200 +
  // tenant_id sin disparar pipeline. Útil para validar conectividad antes de
  // enviar mensajes reales.
  app.get<{ Params: WebhookParams }>(
    '/integrations/webhook/:tenant_token/ping',
    async (request: FastifyRequest<{ Params: WebhookParams }>, reply: FastifyReply) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'ghl_webhook');
      if (!resolved) {
        return reply.code(404).send({ ok: false, error: 'tenant_token invalid or inactive' });
      }
      return reply.code(200).send({
        ok: true,
        tenant_id: resolved.tenantId,
        purpose: 'ghl_webhook',
        verify_mode: env.GHL_WEBHOOK_VERIFY_MODE,
        message: 'Endpoint ready. POST aquí para procesar webhooks.',
        timestamp: new Date().toISOString(),
      });
    },
  );

  app.post<{ Params: WebhookParams; Body: unknown }>(
    '/integrations/webhook/:tenant_token',
    async (
      request: FastifyRequest<{ Params: WebhookParams; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const { tenant_token } = request.params;
      const supabase = getSupabase();

      // 1. Resolver tenant
      const resolved = await resolveTenantByToken(supabase, tenant_token, 'ghl_webhook');
      if (!resolved) {
        return reply.code(404).send({ error: 'tenant_token invalid or inactive' });
      }
      const { tenantId } = resolved;

      // 2. Verificación firma RSA
      const verifyMode = env.GHL_WEBHOOK_VERIFY_MODE;
      if (verifyMode !== 'disabled') {
        const sigHeader = pickHeader(request, 'x-wh-signature');
        const pubKey = env.GHL_WEBHOOK_PUBLIC_KEY_PEM ?? '';
        if (!pubKey) {
          request.log.warn(
            { tenantId, verifyMode },
            'webhook-ghl: GHL_WEBHOOK_PUBLIC_KEY_PEM no configurada',
          );
          if (verifyMode === 'enforce') {
            return reply.code(401).send({ error: 'public_key_not_configured' });
          }
        } else {
          const rawBody =
            request.rawBody ??
            Buffer.from(
              typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}),
              'utf8',
            );
          const result = verifyGhlSignature({
            rawBody,
            signatureHeader: sigHeader,
            publicKeyPem: pubKey,
          });
          if (!result.ok) {
            request.log.warn(
              { tenantId, verifyMode, reason: result.reason, hasSignature: Boolean(sigHeader) },
              `webhook-ghl: signature verification failed (${result.reason})`,
            );
            if (verifyMode === 'enforce') {
              return reply.code(401).send({ error: 'invalid signature', reason: result.reason });
            }
          } else {
            request.log.debug({ tenantId }, 'webhook-ghl: signature OK');
          }
        }
      }

      // 3. Cargar integration_account ghl + GhlClient (best-effort: si no hay
      //    credenciales, seguimos sin enriquecer contacto desde GHL).
      const ghlClient = await loadGhlClient(supabase, tenantId);

      // 3.5. Log del body crudo recibido (Bloque C.7 debug — nos ayuda a ver el
      //      formato real del Workflow webhook step de GHL para iterar el parser).
      request.log.info(
        {
          tenantId,
          bodyKeys: Object.keys((request.body ?? {}) as Record<string, unknown>),
          body: request.body,
        },
        'webhook-ghl: payload received (raw)',
      );

      // 4. Parsear payload + validar locationId
      let payload;
      try {
        payload = parseGhlWebhookPayload(request.body);
      } catch (err) {
        if (err instanceof GhlParseError) {
          request.log.warn(
            { tenantId, issues: err.issues, body: request.body },
            'webhook-ghl: payload rejected by Zod parser',
          );
          return reply.code(400).send({ error: 'invalid payload', issues: err.issues });
        }
        if (err instanceof ZodError) {
          request.log.warn(
            { tenantId, issues: err.flatten(), body: request.body },
            'webhook-ghl: payload rejected by Zod parser',
          );
          return reply.code(400).send({ error: 'invalid payload', issues: err.flatten() });
        }
        throw err;
      }

      const expectedLocationId = await loadExpectedLocationId(supabase, tenantId);
      if (expectedLocationId && payload.locationId !== expectedLocationId) {
        request.log.warn(
          { tenantId, expected: expectedLocationId, got: payload.locationId },
          'webhook-ghl: locationId mismatch',
        );
        return reply.code(403).send({ error: 'location_id mismatch' });
      }

      // 5. Routing por tipo
      try {
        if (payload.type === 'InboundMessage') {
          // Dedup por messageId GHL si está, sino por contactId+timestamp
          const dedupKey = payload.messageId ?? `${payload.contactId}:${payload.timestamp ?? Date.now()}`;
          const fullDedupKey = `ghl:${tenantId}:${dedupKey}`;
          const claimed = await tryClaimDedupKey(fullDedupKey, 60);
          if (!claimed) {
            return reply.code(200).send({ ack: true, deduped: true, tenant_id: tenantId });
          }

          const debounceWindow = await loadDebounceWindow(supabase, tenantId);
          const inbound = parseGhlInboundMessage(payload, tenantId, request.body);
          const result = await routeGhlInbound({
            supabase,
            redis: getRedis(),
            ghlClient,
            inbound,
            debounceWindowSeconds: debounceWindow,
          });
          await touchIntegrationLastWebhook(supabase, tenantId, 'ghl');
          return reply.code(200).send({
            ack: true,
            type: 'InboundMessage',
            tenant_id: tenantId,
            ...result,
          });
        }

        if (payload.type === 'OutboundMessage') {
          const outbound = parseGhlOutboundMessage(payload, tenantId);
          const result = await routeGhlOutbound({ supabase, ghlClient, outbound });
          await touchIntegrationLastWebhook(supabase, tenantId, 'ghl');
          return reply.code(200).send({
            ack: true,
            type: 'OutboundMessage',
            tenant_id: tenantId,
            classification: result.classification,
            conversation_id: result.conversationId,
            paused: result.isPaused,
          });
        }

        // Tipo desconocido → ack para no romper Workflow
        request.log.warn({ tenantId, type: (payload as { type: string }).type }, 'webhook-ghl: unknown type');
        return reply.code(200).send({ ack: true, ignored: true, tenant_id: tenantId });
      } catch (err) {
        request.log.error({ err, tenantId }, 'webhook-ghl: handler error');
        // Aún así ack 200 para no entrar en retry loops infinitos de GHL
        return reply.code(200).send({
          ack: true,
          tenant_id: tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // POST /integrations/webhook/oauth — receiver de los webhooks de la App
  // Marketplace GHL propia (Sub-Account OAuth, Bloque C.E). A diferencia del
  // handler `:tenant_token` (Workflow webhook step), aquí:
  //   - NO hay token en URL: el tenant se resuelve por `payload.locationId`
  //     (lookup en integration_accounts con auth_type='oauth').
  //   - La firma es HMAC con shared_secret o RSA con public key universal —
  //     verifyMarketplaceWebhook detecta cuál por header y valida.
  //   - Mismo router (routeGhlInbound / routeGhlOutbound) reutilizado.
  app.post<{ Body: unknown }>(
    '/integrations/webhook/oauth',
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const supabase = getSupabase();

      // 1. Verificación firma (HMAC + RSA fallback) con verify_mode
      const verifyMode = env.GHL_WEBHOOK_VERIFY_MODE;
      if (verifyMode !== 'disabled') {
        const rawBody =
          request.rawBody ??
          Buffer.from(
            typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}),
            'utf8',
          );
        const result = verifyMarketplaceWebhook({
          rawBody,
          rsaSignatureHeader: pickHeader(request, 'x-wh-signature'),
          hmacSignatureHeader: pickHeader(request, 'x-ghl-signature'),
          rsaPublicKeyPem: env.GHL_WEBHOOK_PUBLIC_KEY_PEM,
          hmacSharedSecret: env.GHL_OAUTH_SHARED_SECRET,
        });
        if (!result.ok) {
          request.log.warn(
            { verifyMode, reason: result.reason },
            `webhook-ghl(oauth): signature verification failed (${result.reason})`,
          );
          if (verifyMode === 'enforce') {
            return reply.code(401).send({ error: 'invalid signature', reason: result.reason });
          }
        } else {
          request.log.debug({ method: result.method }, 'webhook-ghl(oauth): signature OK');
        }
      }

      // 2. Log payload raw para debug del primer evento de la app.
      request.log.info(
        {
          bodyKeys: Object.keys((request.body ?? {}) as Record<string, unknown>),
          body: request.body,
          headers: {
            'x-wh-signature': pickHeader(request, 'x-wh-signature'),
            'x-ghl-signature': pickHeader(request, 'x-ghl-signature'),
          },
        },
        'webhook-ghl(oauth): payload received (raw)',
      );

      // 3. Parse payload
      let payload;
      try {
        payload = parseGhlWebhookPayload(request.body);
      } catch (err) {
        if (err instanceof GhlParseError) {
          request.log.warn(
            { issues: err.issues, body: request.body },
            'webhook-ghl(oauth): payload rejected by Zod parser',
          );
          return reply.code(400).send({ error: 'invalid payload', issues: err.issues });
        }
        if (err instanceof ZodError) {
          request.log.warn(
            { issues: err.flatten(), body: request.body },
            'webhook-ghl(oauth): payload rejected by Zod parser',
          );
          return reply.code(400).send({ error: 'invalid payload', issues: err.flatten() });
        }
        throw err;
      }

      // 4. Resolver tenant por locationId del payload + auth_type='oauth'
      const tenantId = await resolveTenantByOauthLocation(supabase, payload.locationId);
      if (tenantId == null) {
        // Webhook de una sub-cuenta que no tenemos registrada (otra agencia).
        // Ack 200 ignored para no romper retry GHL ni revelar info.
        request.log.info(
          { locationId: payload.locationId, type: payload.type },
          'webhook-ghl(oauth): unknown locationId — ignoring',
        );
        return reply.code(200).send({ ack: true, ignored: true, reason: 'unknown_location' });
      }

      // 5. Routing
      try {
        if (payload.type === 'InboundMessage') {
          const dedupKey =
            payload.messageId ?? `${payload.contactId}:${payload.timestamp ?? Date.now()}`;
          const fullDedupKey = `ghl_oauth:${tenantId}:${dedupKey}`;
          const claimed = await tryClaimDedupKey(fullDedupKey, 60);
          if (!claimed) {
            return reply.code(200).send({ ack: true, deduped: true, tenant_id: tenantId });
          }

          const ghlClient = await loadGhlClient(supabase, tenantId);
          const debounceWindow = await loadDebounceWindow(supabase, tenantId);
          const inbound = parseGhlInboundMessage(payload, tenantId, request.body);
          const result = await routeGhlInbound({
            supabase,
            redis: getRedis(),
            ghlClient,
            inbound,
            debounceWindowSeconds: debounceWindow,
          });
          await touchIntegrationLastWebhook(supabase, tenantId, 'ghl');
          return reply.code(200).send({
            ack: true,
            type: 'InboundMessage',
            tenant_id: tenantId,
            ...result,
          });
        }

        if (payload.type === 'OutboundMessage') {
          const ghlClient = await loadGhlClient(supabase, tenantId);
          const outbound = parseGhlOutboundMessage(payload, tenantId);
          const result = await routeGhlOutbound({ supabase, ghlClient, outbound });
          await touchIntegrationLastWebhook(supabase, tenantId, 'ghl');
          return reply.code(200).send({
            ack: true,
            type: 'OutboundMessage',
            tenant_id: tenantId,
            classification: result.classification,
            conversation_id: result.conversationId,
            paused: result.isPaused,
          });
        }

        request.log.warn(
          { tenantId, type: (payload as { type: string }).type },
          'webhook-ghl(oauth): unknown type',
        );
        return reply.code(200).send({ ack: true, ignored: true, tenant_id: tenantId });
      } catch (err) {
        request.log.error({ err, tenantId }, 'webhook-ghl(oauth): handler error');
        return reply.code(200).send({
          ack: true,
          tenant_id: tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function loadGhlClient(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
): Promise<GhlClient | null> {
  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ia) return null;
  try {
    const creds = decodeCredentialsRow(ia, Number(ia.id));
    const locationId = typeof creds.locationId === 'string' ? creds.locationId : '';
    const apiToken = typeof creds.apiToken === 'string' ? creds.apiToken : '';
    if (!locationId || !apiToken) return null;
    return new GhlClient({ locationId, apiToken });
  } catch {
    return null;
  }
}

async function loadExpectedLocationId(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
): Promise<string | null> {
  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .maybeSingle();
  if (!ia) return null;
  const cfg = (ia.connection_config ?? {}) as Record<string, unknown>;
  return typeof cfg.locationId === 'string' ? cfg.locationId : null;
}

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

function pickHeader(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return undefined;
}
