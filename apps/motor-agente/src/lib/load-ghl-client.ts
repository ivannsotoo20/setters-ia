/**
 * Helper compartido para cargar un GhlClient autenticado por tenant.
 *
 * Sprint Iota.5 PR-B: usa `resolveGhlCredentials` con prioridad PIT → OAuth
 * → legacy. PIT no requiere refresh; OAuth se refresca automáticamente si
 * quedan <5min de TTL.
 *
 * Devuelve null si no hay integración GHL utilizable — caller debe manejar
 * el null silenciosamente (tenant sin GHL configurado).
 *
 * Refactor 2026-05-17 (Hito 10.6): extraído de webhook-ghl.ts para reuso
 * en process-debounced.ts (API booking).
 * Refactor 2026-05-19 (Sprint Iota.5 PR-B): pasa por resolveGhlCredentials
 * para soportar Modelo C híbrido.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { GhlClient } from '@fyzon/ghl-client';
import { resolveGhlCredentials } from './resolve-ghl-credentials.js';
import { logger } from './logger.js';

export async function loadGhlClientByTenant(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<GhlClient | null> {
  const cred = await resolveGhlCredentials(supabase, tenantId, {
    warn: (o, msg) => logger.warn(o, msg),
    info: (o, msg) => logger.info(o, msg),
  });
  if (!cred.ok) return null;
  return new GhlClient({ locationId: cred.locationId, apiToken: cred.accessToken });
}
