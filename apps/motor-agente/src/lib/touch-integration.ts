import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

/**
 * Hito 9 sub-fase 6 — Helper para tocar `integration_accounts.last_webhook_at`
 * tras procesar un webhook entrante (GHL, ManyChat, YCloud, lead-form).
 *
 * Usado por el dashboard /settings/integrations/health del panel para mostrar
 * cuándo recibió el último webhook por cuenta + estado verde/ámbar/rojo.
 *
 * Best-effort: si el UPDATE falla, log warn y continúa (no rompe el ack).
 */
export async function touchIntegrationLastWebhook(
  supabase: SupabaseClient,
  tenantId: number,
  provider: 'manychat' | 'ycloud' | 'ghl' | 'meta_cloud',
): Promise<void> {
  try {
    const { error } = await supabase
      .from('integration_accounts')
      .update({ last_webhook_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .eq('is_active', true);
    if (error) {
      logger.warn(
        { tenantId, provider, err: error.message },
        'touchIntegrationLastWebhook failed (non-fatal)',
      );
    }
  } catch (err) {
    logger.warn(
      { tenantId, provider, err: err instanceof Error ? err.message : String(err) },
      'touchIntegrationLastWebhook threw (non-fatal)',
    );
  }
}
