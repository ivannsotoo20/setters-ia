#!/usr/bin/env tsx
/**
 * Diagnóstico de solo lectura: configuración y huecos libres de los calendarios
 * GHL vinculados a un tenant. No escribe nada en GHL ni en la BD.
 *
 * Uso desde la raíz del monorepo:
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/diag-calendars-tenant.ts --tenant 7
 */

import { getSupabase } from '../src/lib/supabase.js';
import { loadGhlClientByTenant } from '../src/lib/load-ghl-client.js';

const argIdx = process.argv.indexOf('--tenant');
const TENANT_ID = Number(argIdx > -1 ? process.argv[argIdx + 1] : NaN);
const TZ = 'Europe/Madrid';

function madridHour(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

async function main(): Promise<void> {
  if (!Number.isFinite(TENANT_ID)) throw new Error('Falta --tenant <id>');
  const supabase = getSupabase();
  const ghl = await loadGhlClientByTenant(supabase, TENANT_ID);
  if (!ghl) throw new Error(`Sin cliente GHL para el tenant ${TENANT_ID}`);

  const { data: cals, error } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name, channel_kind, is_default')
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
    .order('id');
  if (error) throw error;

  for (const cal of cals ?? []) {
    const calId = String(cal.external_calendar_id);
    console.log(`\n=== ${cal.name} (${calId}) canal=${cal.channel_kind ?? 'genérico'} default=${cal.is_default}`);

    const detail = (await ghl.getCalendar(calId)) as Record<string, unknown> | null;
    if (detail) {
      const pick = (k: string) => (k in detail ? JSON.stringify(detail[k]) : '—');
      for (const k of [
        'calendarType', 'eventType', 'slotDuration', 'slotDurationUnit', 'slotInterval', 'slotIntervalUnit',
        'slotBuffer', 'preBuffer', 'allowBookingAfter', 'allowBookingAfterUnit', 'allowBookingFor',
        'allowBookingForUnit', 'appoinmentPerSlot', 'appoinmentPerDay', 'autoConfirm', 'shouldAssignContactToTeamMember',
        'openHours', 'availabilities', 'availabilityType', 'timezone', 'teamMembers',
      ]) {
        const v = pick(k);
        if (v !== '—') console.log(`  ${k}: ${v.length > 600 ? `${v.slice(0, 600)}…` : v}`);
      }
    } else {
      console.log('  (getCalendar devolvió vacío)');
    }

    const now = Date.now();
    const raw = (await ghl.getFreeSlots(calId, {
      startDate: now,
      endDate: now + 10 * 24 * 60 * 60 * 1000,
      timezone: TZ,
    })) as Record<string, unknown>;
    const slots: string[] = [];
    for (const [k, v] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const list = (v as { slots?: string[] })?.slots ?? [];
      slots.push(...list);
    }
    slots.sort();
    const byHour = new Map<string, number>();
    const odd: string[] = [];
    for (const s of slots) {
      const h = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date(s)),
      );
      byHour.set(String(h).padStart(2, '0'), (byHour.get(String(h).padStart(2, '0')) ?? 0) + 1);
      if (h < 9 || h >= 21) odd.push(madridHour(s));
    }
    console.log(`  huecos libres próximos 10 días: ${slots.length}`);
    console.log(`  por hora (Madrid): ${[...byHour.entries()].sort().map(([h, n]) => `${h}h=${n}`).join('  ')}`);
    console.log(`  fuera de 09-21h (Madrid): ${odd.length ? odd.slice(0, 12).join(' | ') : 'ninguno'}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
