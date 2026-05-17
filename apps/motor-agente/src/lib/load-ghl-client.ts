/**
 * Helper compartido para cargar un GhlClient autenticado por tenant.
 *
 * Lee `integration_accounts` (provider='ghl', is_active=true) → decodifica
 * credenciales (encrypted o legacy plain) → construye GhlClient con
 * `locationId` + `apiToken`.
 *
 * Devuelve null si no hay integration GHL activa o las credenciales son
 * inválidas — caller debe manejar el null silenciosamente (tenant sin GHL).
 *
 * Refactor 2026-05-17 (Hito 10.6): extraído de webhook-ghl.ts para reuso
 * en process-debounced.ts (API booking).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { GhlClient } from '@fyzon/ghl-client';
import { decodeCredentialsRow } from './integration-credentials.js';

export async function loadGhlClientByTenant(
  supabase: SupabaseClient,
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
