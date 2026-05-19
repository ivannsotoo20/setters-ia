/**
 * Integration health check — Sprint Iota.5 PR-D.
 *
 * Escanea `integration_accounts` activas y enqueue evento `integration_down` en
 * `notification_events` cuando una integración lleva más de `health_threshold_hours_red`
 * (default 72h) sin recibir webhooks. El cron `notify-tick` ya existente
 * procesa los eventos y manda email via Resend al trainer suscrito.
 *
 * Doble protección anti-flood:
 *   1. La consulta SELECT solo trae integraciones con `last_webhook_at` por debajo
 *      del threshold rojo (no las verdes/amber).
 *   2. INSERT con ON CONFLICT DO NOTHING contra el UNIQUE parcial
 *      `uniq_notif_integration_down_per_window` (migration 063) — solo 1 evento
 *      por (tenant, integration_account, window_key).
 *
 * `window_key`: bloque temporal calculado como `floor(age_hours / threshold_red)`.
 * Cada vez que la integración cruza el siguiente múltiplo del threshold se
 * renotifica una vez. Sin window_key el cron generaría duplicados cada tick.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';

type SupabaseTyped = SupabaseClient<Database>;

export interface HealthCheckDeps {
  supabase: SupabaseTyped;
  /** Override del clock para tests. */
  now?: () => Date;
  log?: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
}

export interface HealthCheckResult {
  scanned: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

const DEFAULT_THRESHOLD_RED_HOURS = 72;

export async function checkIntegrationsHealth(
  deps: HealthCheckDeps,
): Promise<HealthCheckResult> {
  const now = (deps.now ?? (() => new Date()))();
  const nowMs = now.getTime();
  const log = deps.log ?? {
    info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
    warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
    error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
  };

  // 1. Cargar tenant_configs.health_threshold_hours_red por tenant (default 72h).
  const { data: configs, error: cfgErr } = await deps.supabase
    .from('tenant_configs')
    .select('tenant_id, health_threshold_hours_red');
  if (cfgErr) {
    log.error({ err: cfgErr.message }, 'integration-health-check: load tenant_configs failed');
    return { scanned: 0, enqueued: 0, skipped: 0, errors: 1 };
  }
  const thresholdByTenant = new Map<number, number>();
  for (const c of configs ?? []) {
    const t = c.health_threshold_hours_red;
    if (typeof t === 'number' && t > 0) thresholdByTenant.set(Number(c.tenant_id), t);
  }

  // 2. Cargar integration_accounts activos con channel asociado.
  const { data: rows, error: rowsErr } = await deps.supabase
    .from('integration_accounts')
    .select(
      'id, tenant_id, provider, is_active, last_webhook_at, created_at, channel_id, channels(channel_type)',
    )
    .eq('is_active', true);
  if (rowsErr) {
    log.error({ err: rowsErr.message }, 'integration-health-check: load integration_accounts failed');
    return { scanned: 0, enqueued: 0, skipped: 0, errors: 1 };
  }

  let enqueued = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of rows ?? []) {
    const tenantId = Number(r.tenant_id);
    const integrationAccountId = Number(r.id);
    const provider = String(r.provider);
    const lastWebhookAt = (r.last_webhook_at as string | null) ?? null;
    const createdAt = String(r.created_at);
    const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
    const channelType = (ch as { channel_type?: string } | null)?.channel_type ?? null;

    const thresholdRedHours = thresholdByTenant.get(tenantId) ?? DEFAULT_THRESHOLD_RED_HOURS;

    // Cuánto tiempo lleva sin webhook. Si NULL, usamos created_at como referencia
    // (no spamear a tenants recién creados que aún no han recibido nada).
    const referenceMs = lastWebhookAt
      ? new Date(lastWebhookAt).getTime()
      : new Date(createdAt).getTime();
    const ageHours = (nowMs - referenceMs) / (1000 * 60 * 60);

    if (ageHours < thresholdRedHours) {
      skipped++;
      continue;
    }

    // window_key = floor(ageHours / thresholdRedHours). Renotifica solo cuando
    // cruza el siguiente bloque (e.g. 72h, 144h, 216h... para threshold=72h).
    const windowKey = Math.floor(ageHours / thresholdRedHours).toString();

    const insert = await deps.supabase.from('notification_events').insert({
      tenant_id: tenantId,
      event_type: 'integration_down',
      payload: {
        integration_account_id: integrationAccountId,
        provider,
        channel_type: channelType,
        last_webhook_at: lastWebhookAt,
        threshold_hours: thresholdRedHours,
        window_key: windowKey,
      } as Database['public']['Tables']['notification_events']['Insert']['payload'],
      status: 'pending',
    });

    if (insert.error) {
      // ON CONFLICT DO NOTHING no aplica via supabase-js insert; el UNIQUE
      // parcial dispara error 23505 que tratamos como skip silencioso.
      if (insert.error.code === '23505') {
        skipped++;
      } else {
        log.warn(
          { err: insert.error.message, tenantId, integrationAccountId },
          'integration-health-check: enqueue failed',
        );
        errors++;
      }
      continue;
    }
    enqueued++;
    log.info(
      { tenantId, integrationAccountId, provider, ageHours, thresholdRedHours, windowKey },
      'integration-health-check: enqueued integration_down event',
    );
  }

  return { scanned: rows?.length ?? 0, enqueued, skipped, errors };
}
