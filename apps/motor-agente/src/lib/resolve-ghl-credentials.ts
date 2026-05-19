/**
 * Resuelve credenciales GHL con prioridad **PIT → OAuth → legacy**.
 * Sprint Iota.5 PR-B — extraído de routes/internal-calendars.ts para reuso.
 *
 * Modelo C híbrido: el trainer puede tener simultáneamente:
 *   - 1 row OAuth Marketplace (`auth_type='oauth'`, scopes fijos definidos en
 *     developer.gohighlevel.com) — usada para recibir webhooks push.
 *   - 1 row PIT BYOK (`auth_type='pit'`, scopes granulares activados por el
 *     trainer en GHL Settings → Private Integrations) — usada para API
 *     server-to-server.
 *
 * Para llamadas síncronas (sync calendars, ensureCustomField, backfill,
 * send outbound), preferimos PIT porque típicamente tiene scopes más amplios
 * y no requiere refresh logic. OAuth queda como fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeCredentialsRow } from './integration-credentials.js';
import { getValidAccessToken } from './ghl-oauth.js';

export type CredOk = {
  ok: true;
  accessToken: string;
  locationId: string;
  credSource: 'pit' | 'oauth' | 'legacy';
};
export type CredFail = { ok: false; status: number; error: string; message: string };
export type ResolvedCreds = CredOk | CredFail;

export interface ResolveLogger {
  warn: (o: object, msg: string) => void;
  info?: (o: object, msg: string) => void;
}

export async function resolveGhlCredentials(
  supabase: SupabaseClient,
  tenantId: number,
  log: ResolveLogger,
): Promise<ResolvedCreds> {
  // 1. PIT BYOK (preferido)
  const pit = await tryLoadGhlPit(supabase, tenantId);
  if (pit.ok) return pit;

  // 2. OAuth Marketplace (con refresh)
  try {
    const tokens = await getValidAccessToken(supabase, tenantId);
    const lid = tokens.locationId ?? '';
    if (!lid) {
      log.warn({ tenantId }, 'resolveGhlCredentials: OAuth sin locationId, intentando legacy fallback');
    } else {
      return { ok: true, accessToken: tokens.accessToken, locationId: lid, credSource: 'oauth' };
    }
  } catch (oauthErr) {
    log.warn(
      { tenantId, err: oauthErr instanceof Error ? oauthErr.message : String(oauthErr) },
      'resolveGhlCredentials: OAuth path unavailable, trying legacy API Key fallback',
    );
  }

  // 3. Legacy fallback: cualquier row con apiToken
  return loadGhlLegacy(supabase, tenantId);
}

async function tryLoadGhlPit(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<ResolvedCreds> {
  const { data: rows, error } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false });

  if (error || !rows || rows.length === 0) {
    return { ok: false, status: 409, error: 'no_pit_row', message: 'no PIT row' };
  }

  const pitRow = rows.find((r) => {
    const cc = (r.connection_config ?? {}) as { auth_type?: string };
    return cc.auth_type === 'pit';
  });
  if (!pitRow) {
    return { ok: false, status: 409, error: 'no_pit_row', message: 'no PIT row' };
  }

  try {
    const decoded = decodeCredentialsRow(pitRow, Number(pitRow.id));
    const at = typeof decoded.apiToken === 'string' ? decoded.apiToken : '';
    const lid = extractLocationId(decoded, pitRow.connection_config);
    if (!at || !lid) {
      return { ok: false, status: 409, error: 'pit_credentials_incomplete', message: 'PIT row sin apiToken o locationId' };
    }
    return { ok: true, accessToken: at, locationId: lid, credSource: 'pit' };
  } catch (decodeErr) {
    return {
      ok: false,
      status: 409,
      error: 'pit_credentials_decode_failed',
      message: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
    };
  }
}

async function loadGhlLegacy(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<ResolvedCreds> {
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (iaErr || !ia) {
    return {
      ok: false,
      status: 409,
      error: 'ghl_unavailable',
      message: 'No hay integración GHL activa para este tenant.',
    };
  }
  try {
    const decoded = decodeCredentialsRow(ia, Number(ia.id));
    const at = typeof decoded.apiToken === 'string' ? decoded.apiToken : '';
    const lid = extractLocationId(decoded, ia.connection_config);
    if (!at || !lid) {
      return {
        ok: false,
        status: 409,
        error: 'ghl_credentials_incomplete',
        message:
          'integration_accounts no tiene PIT, OAuth válido NI apiToken+locationId. Reconfigura la integración GHL desde /settings/integrations.',
      };
    }
    return { ok: true, accessToken: at, locationId: lid, credSource: 'legacy' };
  } catch (decodeErr) {
    return {
      ok: false,
      status: 409,
      error: 'ghl_credentials_decode_failed',
      message: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
    };
  }
}

function extractLocationId(
  decoded: Record<string, unknown>,
  connectionConfig: unknown,
): string {
  if (typeof decoded.locationId === 'string' && decoded.locationId.length > 0) {
    return decoded.locationId;
  }
  const cc = (connectionConfig ?? {}) as Record<string, unknown>;
  if (typeof cc.locationId === 'string' && cc.locationId.length > 0) {
    return cc.locationId;
  }
  return '';
}
