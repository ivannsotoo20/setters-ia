import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { buildOauthIntegrationFields, exchangeCodeForTokens, GhlOauthError } from '../lib/ghl-oauth.js';
import { getRedis } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { getOrCreateChannel, resolveTenantByToken } from '../services/lead-ingest.js';

const STATE_TTL_SECONDS = 600; // 10 minutos para completar el OAuth flow

interface InstallQuery {
  tenant_token?: string;
}

interface CallbackQuery {
  code?: string;
  locationId?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Endpoints OAuth para la App Marketplace GHL propia (Bloque C.E).
 *
 * Flow Sub-Account distribution:
 *   1. Trainer recibe URL `/integrations/oauth/install?tenant_token=<X>`
 *      (un link único por trainer).
 *   2. Motor genera state UUID, persiste `oauth:state:<UUID> → tenant_id`
 *      en Redis (TTL 600s) y redirige a chooselocation GHL con el state.
 *   3. Trainer autoriza la app en su sub-cuenta GHL.
 *   4. GHL redirige al callback con `?code=X&locationId=Y&state=Z`.
 *   5. Motor consume state → tenant_id, intercambia code por tokens, persiste
 *      cifrado en `integration_accounts`.
 *
 * Path neutro `/integrations/...` porque el developer portal de GHL valida y
 * rechaza redirect URIs con "ghl"/"highlevel".
 */
export async function oauthGhlRoutes(app: FastifyInstance): Promise<void> {
  // GET /integrations/oauth/install?tenant_token=<X>
  app.get<{ Querystring: InstallQuery }>(
    '/integrations/oauth/install',
    async (
      request: FastifyRequest<{ Querystring: InstallQuery }>,
      reply: FastifyReply,
    ) => {
      const tenantToken = request.query.tenant_token;
      if (!tenantToken) {
        return reply.code(400).send({ error: 'tenant_token query parameter is required' });
      }

      const clientId = env.GHL_OAUTH_CLIENT_ID;
      if (!clientId) {
        request.log.error('oauth-ghl: GHL_OAUTH_CLIENT_ID not configured');
        return reply.code(503).send({ error: 'oauth_not_configured' });
      }

      const supabase = getSupabase();
      const resolved = await resolveTenantByToken(supabase, tenantToken, 'ghl_webhook');
      if (!resolved) {
        return reply.code(404).send({ error: 'tenant_token invalid or inactive' });
      }

      // State UUID en Redis → tenant_id
      const state = randomUUID();
      const redis = getRedis();
      try {
        await redis.set(`oauth:state:${state}`, String(resolved.tenantId), 'EX', STATE_TTL_SECONDS);
      } catch (err) {
        request.log.error({ err }, 'oauth-ghl: failed to persist state in Redis');
        return reply.code(503).send({ error: 'redis_unavailable' });
      }

      const versionId = env.GHL_OAUTH_VERSION_ID;
      if (!versionId) {
        request.log.error('oauth-ghl: GHL_OAUTH_VERSION_ID not configured');
        return reply.code(503).send({ error: 'oauth_version_id_not_configured' });
      }

      const params = new URLSearchParams({
        response_type: 'code',
        redirect_uri: env.GHL_OAUTH_REDIRECT_URI,
        client_id: clientId,
        scope: env.GHL_OAUTH_SCOPES,
        state,
        version_id: versionId,
      });
      // GHL exige el path `/v2/oauth/chooselocation` (no `/oauth/chooselocation`).
      // Sin `version_id` el endpoint devuelve `error.noAppVersionIdFound`.
      const target = `${env.GHL_MARKETPLACE_BASE}/v2/oauth/chooselocation?${params.toString()}`;

      request.log.info(
        { tenantId: resolved.tenantId, state, redirect: env.GHL_OAUTH_REDIRECT_URI },
        'oauth-ghl: redirecting to chooselocation',
      );
      return reply.redirect(target, 302);
    },
  );

  // GET /integrations/oauth/callback?code=X&locationId=Y&state=Z
  app.get<{ Querystring: CallbackQuery }>(
    '/integrations/oauth/callback',
    async (
      request: FastifyRequest<{ Querystring: CallbackQuery }>,
      reply: FastifyReply,
    ) => {
      const { code, state, locationId, error, error_description } = request.query;

      if (error) {
        request.log.warn(
          { error, error_description },
          'oauth-ghl: callback received error from GHL',
        );
        return reply
          .code(400)
          .type('text/html')
          .send(renderHtml('Error', `GHL devolvió un error: ${error}. ${error_description ?? ''}`));
      }

      if (!code || !state) {
        return reply
          .code(400)
          .type('text/html')
          .send(renderHtml('Faltan parámetros', 'El callback no incluye code o state.'));
      }

      // Lookup state → tenant_id
      const redis = getRedis();
      const tenantIdRaw = await redis.get(`oauth:state:${state}`);
      if (!tenantIdRaw) {
        return reply
          .code(400)
          .type('text/html')
          .send(
            renderHtml(
              'State expirado',
              'El enlace de instalación caducó. Vuelve a generar uno nuevo desde el panel.',
            ),
          );
      }
      const tenantId = Number(tenantIdRaw);
      if (!Number.isFinite(tenantId)) {
        return reply.code(400).type('text/html').send(renderHtml('State inválido', 'state no decodificable.'));
      }
      // Borrar state inmediatamente — single-use para evitar replay.
      await redis.del(`oauth:state:${state}`);

      const clientId = env.GHL_OAUTH_CLIENT_ID;
      const clientSecret = env.GHL_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        request.log.error('oauth-ghl: GHL_OAUTH_CLIENT_ID/SECRET not configured');
        return reply.code(503).type('text/html').send(renderHtml('Configuración', 'El motor no tiene OAuth configurado.'));
      }

      // Exchange code → tokens
      let tokens;
      try {
        tokens = await exchangeCodeForTokens({
          code,
          clientId,
          clientSecret,
          redirectUri: env.GHL_OAUTH_REDIRECT_URI,
        });
      } catch (err) {
        const ghlErr = err as GhlOauthError;
        request.log.error(
          { err: ghlErr.message, status: ghlErr.status, body: ghlErr.bodySnippet, tenantId },
          'oauth-ghl: token exchange failed',
        );
        return reply
          .code(502)
          .type('text/html')
          .send(
            renderHtml(
              'Error intercambiando token',
              `${ghlErr.message}. Revisa los logs del motor.`,
            ),
          );
      }

      // GHL devuelve locationId/companyId en la respuesta del token; el query
      // param también lo incluye en algunos casos. Preferimos el del token.
      const finalLocationId = tokens.locationId ?? locationId ?? undefined;

      // Persist en integration_accounts (UPSERT por tenant_id+locationId+oauth)
      const supabase = getSupabase();
      const fields = buildOauthIntegrationFields(
        { ...tokens, ...(finalLocationId ? { locationId: finalLocationId } : {}) },
        new Date().toISOString(),
      );

      // Resolver/crear channel para esta integration. Sub-Account distribution
      // típicamente es 1 location = 1 instagram_dm channel via_provider='ghl'.
      // Reusamos el helper existente (ya idempotente).
      const { channelId } = await getOrCreateChannel({
        supabase,
        tenantId,
        channelType: 'instagram',
        viaProvider: 'ghl',
      });

      // ¿Existe ya un integration_account OAuth para este tenant + locationId? Si sí, update; si no, insert.
      let existingId: number | null = null;
      if (finalLocationId) {
        const { data: existing } = await supabase
          .from('integration_accounts')
          .select('id, connection_config')
          .eq('tenant_id', tenantId)
          .eq('provider', 'ghl')
          .eq('is_active', true);
        if (existing) {
          for (const row of existing) {
            const cc = (row.connection_config ?? {}) as { auth_type?: string; locationId?: string };
            if (cc.auth_type === 'oauth' && cc.locationId === finalLocationId) {
              existingId = Number(row.id);
              break;
            }
          }
        }
      }

      if (existingId) {
        await supabase
          .from('integration_accounts')
          .update({
            credentials_encrypted: fields.credentials_encrypted,
            connection_config: fields.connection_config,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingId);
        request.log.info(
          { tenantId, integrationAccountId: existingId, locationId: finalLocationId },
          'oauth-ghl: re-install detected, tokens updated',
        );
      } else {
        const { error: insertErr } = await supabase.from('integration_accounts').insert({
          tenant_id: tenantId,
          channel_id: channelId,
          provider: 'ghl',
          is_active: true,
          credentials_encrypted: fields.credentials_encrypted,
          connection_config: fields.connection_config,
        });
        if (insertErr) {
          request.log.error(
            { err: insertErr.message, tenantId, locationId: finalLocationId },
            'oauth-ghl: failed to insert integration_account',
          );
          return reply
            .code(500)
            .type('text/html')
            .send(renderHtml('Error guardando integración', insertErr.message));
        }
        request.log.info(
          { tenantId, channelId, locationId: finalLocationId, scope: tokens.scope },
          'oauth-ghl: install completed',
        );
      }

      return reply
        .code(200)
        .type('text/html')
        .send(
          renderHtml(
            '✅ Instalación completada',
            `La app GHL Marketplace ha quedado conectada al tenant ${tenantId}${
              finalLocationId ? ` (location ${finalLocationId})` : ''
            }. Puedes cerrar esta ventana.`,
          ),
        );
    },
  );
}

function renderHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${escapeHtml(title)} — Fyzon Setters IA</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:0 20px;color:#222}h1{margin-bottom:8px}p{font-size:16px;line-height:1.5}</style>
</head>
<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
