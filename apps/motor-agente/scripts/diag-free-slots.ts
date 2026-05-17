#!/usr/bin/env tsx
/**
 * Diagnóstico Hito 10.6 D4 — verifica getFreeSlots real contra GHL del tenant 3
 * y muestra los slots que recibiría el LLM en el system prompt.
 *
 * Uso desde la raíz del monorepo:
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/diag-free-slots.ts
 */

import { getSupabase } from '../src/lib/supabase.js';
import { loadGhlClientByTenant } from '../src/lib/load-ghl-client.js';
import { loadAvailableSlots } from '../src/services/load-available-slots.js';

const TENANT_ID = 3;

async function main(): Promise<void> {
  console.log(`Hoy: ${new Date().toISOString()} (${new Date().toString()})`);

  const supabase = getSupabase();
  const ghlClient = await loadGhlClientByTenant(supabase, TENANT_ID);
  if (!ghlClient) {
    console.error('❌ No hay GhlClient para tenant 3');
    process.exit(1);
  }

  // 1. Calendar default
  const { data: cal } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name')
    .eq('tenant_id', TENANT_ID)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (!cal) {
    console.error('❌ Sin calendar default');
    process.exit(1);
  }
  console.log(`Calendar: "${cal.name}" (${cal.external_calendar_id})`);

  // 2. Slots flat (lo que loadAvailableSlots devuelve)
  const slots = await loadAvailableSlots({
    supabase,
    ghlClient,
    tenantId: TENANT_ID,
    daysForward: 14,
    maxSlots: 8,
  });
  console.log('\n=== Slots que recibe el LLM ===');
  if (!slots || slots.length === 0) {
    console.log('(vacío)');
  } else {
    slots.forEach((s, i) => {
      console.log(`${i + 1}. ${s.humanLabel}  (ISO: ${s.iso})`);
    });
  }

  // 3. Raw response GHL (para entender config calendar)
  const now = Date.now();
  const rawResponse = await ghlClient.getFreeSlots(String(cal.external_calendar_id), {
    startDate: now,
    endDate: now + 14 * 24 * 60 * 60 * 1000,
    timezone: 'Europe/Madrid',
  });
  console.log('\n=== Response raw GHL keys ===');
  console.log(Object.keys(rawResponse));

  // 4. Info del contacto IG (oCFmoWfCEUv6SbeGk8TE) para ver si tiene email/phone
  console.log('\n=== Contacto IG oCFmoWfCEUv6SbeGk8TE en GHL ===');
  try {
    const contact = await ghlClient.getContactInfo('oCFmoWfCEUv6SbeGk8TE');
    if (!contact) {
      console.log('(contacto no encontrado en GHL)');
    } else {
      console.log({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone ?? '(null)',
        email: contact.email ?? '(null)',
        source: contact.source,
      });
    }
  } catch (err) {
    console.error('getContactInfo error:', err instanceof Error ? err.message : String(err));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
