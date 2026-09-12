#!/usr/bin/env tsx
/**
 * Sincroniza una vez las citas GHL de un tenant con el SaaS (2026-09-12).
 *
 * El motor lo hace solo cada 10 minutos (plugins/cron-scheduler.ts →
 * services/calendar-sync.ts). Este script sirve para el primer volcado de una
 * cuenta que nunca recibió webhooks (PIT, como Tania) o para mirar qué devuelve
 * GHL sin tocar nada.
 *
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/calendar-sync-once.ts --tenant 7 --dry-run
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/calendar-sync-once.ts --tenant 7 --days-back 30 --days-forward 90
 *
 * --dry-run  lista las citas por calendario y no escribe nada.
 * Sin --dry-run aplica el sync (crea/actualiza citas, mueve a F7, sin emails:
 * notify=false para no inundar a la entrenadora con reservas antiguas).
 */

import { getSupabase } from '../src/lib/supabase.js';
import { loadGhlClientByTenant } from '../src/lib/load-ghl-client.js';
import { syncCalendarAppointments } from '../src/services/calendar-sync.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

async function main(): Promise<void> {
  const tenantId = Number(arg('tenant'));
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new Error('--tenant <id> es obligatorio');
  }
  const daysBack = Number(arg('days-back') ?? 30);
  const daysForward = Number(arg('days-forward') ?? 90);
  const dryRun = process.argv.includes('--dry-run');
  const supabase = getSupabase();

  if (dryRun) {
    const ghl = await loadGhlClientByTenant(supabase, tenantId);
    if (!ghl) throw new Error(`tenant ${tenantId}: sin credenciales GHL utilizables`);
    const { data: calendars, error } = await supabase
      .from('calendar_accounts')
      .select('id, external_calendar_id, name, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) throw new Error(error.message);
    const now = Date.now();
    const start = new Date(now - daysBack * 86_400_000).toISOString();
    const end = new Date(now + daysForward * 86_400_000).toISOString();
    for (const cal of calendars ?? []) {
      const appts = await ghl.listAppointmentsByCalendar(String(cal.external_calendar_id), start, end);
      console.log(`\n== calendario ${cal.id} "${cal.name}" (${cal.external_calendar_id}): ${appts.length} citas en [${start.slice(0, 10)} .. ${end.slice(0, 10)}]`);
      for (const a of appts) {
        console.log(
          `  ${a.id}  ${a.startTime}  ${a.appointmentStatus.padEnd(9)}  contact=${a.contactId}  added=${a.dateAdded ?? '-'}  ${a.title ?? ''}`,
        );
      }
    }
    return;
  }

  const result = await syncCalendarAppointments({
    supabase,
    tenantId,
    daysBack,
    daysForward,
    notify: false,
    log: {
      info: (o, m) => console.log(m ?? '', JSON.stringify(o)),
      warn: (o, m) => console.warn(m ?? '', JSON.stringify(o)),
      error: (o, m) => console.error(m ?? '', JSON.stringify(o)),
    },
  });
  console.log('\nresultado:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
