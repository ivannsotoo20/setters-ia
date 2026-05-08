/**
 * GHL Marketplace OAuth — helpers para el flujo App Marketplace propia
 * (Bloque C.E, sub-Account distribution).
 *
 * Endpoints GHL:
 *   - Token exchange / refresh: POST {GHL_API_BASE}/oauth/token
 *   - Install / chooselocation: GET  {GHL_MARKETPLACE_BASE}/oauth/chooselocation
 *
 * Flujo:
 *   1. Trainer recibe link `/integrations/oauth/install?tenant_token=<X>`.
 *   2. Motor genera state UUID, persiste `oauth:state:<UUID> → tenant_id` en
 *      Redis (TTL 600s) y redirige a chooselocation.
 *   3. Trainer autoriza app en su sub-cuenta GHL → GHL redirige al
 *      callback con `?code=X&state=Z&locationId=Y`.
 *   4. Motor consume state → tenant_id, intercambia code por tokens
 *      (`exchangeCodeForTokens`), persiste cifrado en `integration_accounts`.
 *   5. Cuando el motor envía outbound, llama a `getValidAccessToken(tenantId)`
 *      que devuelve un access_token válido (refresca si quedan <5min de TTL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { decryptWithDefault, encryptWithDefault, CryptoError } from './crypto.js';
import { logger } from './logger.js';

export interface GhlOauthTokens {
  /** access_token Bearer para Authorization header. Vida ~24h típicamente. */
  accessToken: string;
  /** refresh_token para regenerar access_token tras expirar. Vida muy larga. */
  refreshToken: string;
  /** Segundos de vida del access_token desde su emisión. */
  expiresIn: number;
  /** Timestamp ISO calculado: now + expiresIn. */
  expiresAt: string;
  /** Sub-cuenta GHL donde la app está instalada (Distribution Sub-Account). */
  locationId?: string;
  /** Compañía/agencia padre. */
  companyId?: string;
  /** Scopes concedidos (separados por espacio). */
  scope: string;
  /** 'Location' (sub-account) o 'Company' (agency). Para distribution sub-account → 'Location'. */
  userType: 'Location' | 'Company';
}

/** Shape interno persistido en `credentials_encrypted` (JSON cifrado). */
interface StoredOauthCredentials {
  accessToken: string;
  refreshToken: string;
}

/** Shape persistido en `connection_config` (JSONB plain). */
export interface OauthConnectionConfig {
  auth_type: 'oauth';
  locationId?: string;
  companyId?: string;
  scope: string;
  userType: 'Location' | 'Company';
  expiresAt: string;
  installedAt: string;
}

export class GhlOauthError extends Error {
  readonly status?: number;
  readonly bodySnippet?: string;
  constructor(message: string, opts?: { status?: number; bodySnippet?: string }) {
    super(message);
    this.name = 'GhlOauthError';
    this.status = opts?.status;
    this.bodySnippet = opts?.bodySnippet;
  }
}

/**
 * Intercambia el `code` recibido en el callback por access + refresh tokens.
 *
 * GHL endpoint: POST /oauth/token con application/x-www-form-urlencoded.
 */
export async function exchangeCodeForTokens(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<GhlOauthTokens> {
  const { code, clientId, clientSecret, redirectUri } = args;
  const fetchImpl = args.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    user_type: 'Location',
  });

  const url = `${env.GHL_API_BASE}/oauth/token`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  return parseTokenResponse(res, 'exchangeCodeForTokens');
}

/**
 * Refresca un access_token expirado usando el refresh_token. Devuelve un nuevo
 * par {access, refresh} — GHL rota el refresh_token en cada refresh.
 */
export async function refreshAccessToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<GhlOauthTokens> {
  const { refreshToken, clientId, clientSecret } = args;
  const fetchImpl = args.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    user_type: 'Location',
  });

  const url = `${env.GHL_API_BASE}/oauth/token`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  return parseTokenResponse(res, 'refreshAccessToken');
}

async function parseTokenResponse(res: Response, op: string): Promise<GhlOauthTokens> {
  const text = await res.text();
  if (!res.ok) {
    throw new GhlOauthError(`${op} failed: HTTP ${res.status}`, {
      status: res.status,
      bodySnippet: text.slice(0, 400),
    });
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new GhlOauthError(`${op}: response not valid JSON`, { bodySnippet: text.slice(0, 200) });
  }

  const accessToken = strProp(json, 'access_token');
  const refreshToken = strProp(json, 'refresh_token');
  const expiresIn = numProp(json, 'expires_in');
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
    throw new GhlOauthError(`${op}: missing access_token/refresh_token/expires_in`, {
      bodySnippet: text.slice(0, 200),
    });
  }
  const scope = strProp(json, 'scope') ?? '';
  const userTypeRaw = strProp(json, 'userType') ?? strProp(json, 'user_type') ?? 'Location';
  const userType: 'Location' | 'Company' = userTypeRaw === 'Company' ? 'Company' : 'Location';
  const locationId = strProp(json, 'locationId') ?? strProp(json, 'location_id');
  const companyId = strProp(json, 'companyId') ?? strProp(json, 'company_id');

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return {
    accessToken,
    refreshToken,
    expiresIn,
    expiresAt,
    scope,
    userType,
    ...(locationId ? { locationId } : {}),
    ...(companyId ? { companyId } : {}),
  };
}

function strProp(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function numProp(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === 'number' ? v : Number(v);
}

// ---------------------------------------------------------------------------
// Persistencia / carga desde `integration_accounts`
// ---------------------------------------------------------------------------

/**
 * Construye el blob cifrado y el connection_config a partir de unos tokens
 * frescos. El caller (callback OAuth) lo usa para hacer UPSERT en
 * `integration_accounts`.
 */
export function buildOauthIntegrationFields(
  tokens: GhlOauthTokens,
  installedAtIso: string,
): {
  credentials_encrypted: { blob: string };
  connection_config: OauthConnectionConfig;
} {
  const stored: StoredOauthCredentials = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  const blob = encryptWithDefault(JSON.stringify(stored));
  const connection_config: OauthConnectionConfig = {
    auth_type: 'oauth',
    scope: tokens.scope,
    userType: tokens.userType,
    expiresAt: tokens.expiresAt,
    installedAt: installedAtIso,
    ...(tokens.locationId ? { locationId: tokens.locationId } : {}),
    ...(tokens.companyId ? { companyId: tokens.companyId } : {}),
  };
  return { credentials_encrypted: { blob }, connection_config };
}

/**
 * Devuelve un access_token válido para un tenant. Lee el último
 * `integration_accounts` con `provider='ghl'` + `auth_type='oauth'` +
 * `is_active=true`, descifra los tokens, comprueba expiry. Si quedan <300s
 * (o ya expiró), refresca contra GHL y persiste los tokens nuevos.
 *
 * @throws {GhlOauthError} si no hay integration OAuth o el refresh falla.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  tenantId: number,
  fetchImpl?: typeof fetch,
): Promise<{ accessToken: string; locationId?: string }> {
  const { data: row, error } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(10);

  if (error) {
    throw new GhlOauthError(`getValidAccessToken: query failed: ${error.message}`);
  }
  if (!row || row.length === 0) {
    throw new GhlOauthError(`getValidAccessToken: no active GHL integration_account for tenant ${tenantId}`);
  }

  // Filtrar al integration_account con auth_type='oauth' (priorizar OAuth sobre PIT).
  const oauthRow = row.find((r) => {
    const cc = (r.connection_config ?? {}) as { auth_type?: string };
    return cc.auth_type === 'oauth';
  });
  if (!oauthRow) {
    throw new GhlOauthError(
      `getValidAccessToken: no OAuth integration_account for tenant ${tenantId} (only PIT/legacy found)`,
    );
  }

  const cc = (oauthRow.connection_config ?? {}) as Partial<OauthConnectionConfig>;
  const stored = decryptStored(oauthRow);

  const expiresAtMs = cc.expiresAt ? Date.parse(cc.expiresAt) : 0;
  const safeWindowMs = 5 * 60 * 1000;
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < safeWindowMs;

  if (!needsRefresh) {
    return { accessToken: stored.accessToken, locationId: cc.locationId };
  }

  const clientId = env.GHL_OAUTH_CLIENT_ID;
  const clientSecret = env.GHL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GhlOauthError(
      'getValidAccessToken: cannot refresh — GHL_OAUTH_CLIENT_ID/SECRET not configured',
    );
  }

  logger.info(
    { tenantId, integrationAccountId: Number(oauthRow.id), expiresAt: cc.expiresAt },
    'getValidAccessToken: refreshing access_token',
  );

  const refreshed = await refreshAccessToken({
    refreshToken: stored.refreshToken,
    clientId,
    clientSecret,
    fetchImpl,
  });

  const fields = buildOauthIntegrationFields(refreshed, new Date().toISOString());
  // Mantener locationId/companyId del install original si la response del refresh
  // no los re-emite (algunos providers solo los devuelven en el exchange inicial).
  const mergedConfig: OauthConnectionConfig = {
    ...fields.connection_config,
    ...(refreshed.locationId ? {} : { locationId: cc.locationId }),
    ...(refreshed.companyId ? {} : { companyId: cc.companyId }),
    installedAt: cc.installedAt ?? fields.connection_config.installedAt,
  };

  const { error: updateErr } = await supabase
    .from('integration_accounts')
    .update({
      credentials_encrypted: fields.credentials_encrypted,
      connection_config: mergedConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', oauthRow.id);
  if (updateErr) {
    throw new GhlOauthError(`getValidAccessToken: failed to persist refreshed tokens: ${updateErr.message}`);
  }

  return { accessToken: refreshed.accessToken, locationId: mergedConfig.locationId };
}

function decryptStored(row: {
  credentials?: unknown;
  credentials_encrypted?: unknown;
}): StoredOauthCredentials {
  const enc = row.credentials_encrypted;
  if (enc && typeof enc === 'object') {
    const blob = (enc as { blob?: unknown }).blob;
    if (typeof blob === 'string' && blob.length > 0) {
      try {
        const plain = decryptWithDefault(blob);
        const parsed = JSON.parse(plain) as Partial<StoredOauthCredentials>;
        if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
          return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
        }
        throw new GhlOauthError('decryptStored: missing accessToken/refreshToken in JSON');
      } catch (err) {
        if (err instanceof CryptoError) {
          throw new GhlOauthError(`decryptStored: decryption failed: ${err.message}`);
        }
        throw err;
      }
    }
  }
  // Fallback plain (durante transición)
  const plain = row.credentials;
  if (plain && typeof plain === 'object') {
    const obj = plain as Partial<StoredOauthCredentials>;
    if (typeof obj.accessToken === 'string' && typeof obj.refreshToken === 'string') {
      return { accessToken: obj.accessToken, refreshToken: obj.refreshToken };
    }
  }
  throw new GhlOauthError('decryptStored: no usable credentials in row');
}
