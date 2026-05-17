#!/usr/bin/env tsx
/**
 * Hito 10.5 — Smoke local del flow AppointmentCreate → F7 + email.
 *
 * Invoca handleCalendarEvent con un fake payload AppointmentCreate que
 * incluye fyzon_lead_uuid del lead 10016 (tenant 3, Ivan WhatsApp).
 * Luego procesa la cola de notification_events manualmente (simula el
 * cron notify-tick) y verifica que el email se envió via Resend.
 *
 * Uso desde la raíz del monorepo:
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/smoke-appointment-booked.ts
 *
 * Requisitos:
 *   - .env.local en raíz del repo con SUPABASE_*, RESEND_API_KEY, ANTHROPIC_API_KEY.
 *   - Tenant 3 con calendar default vinculado (iSfmemtdB9kwOU5ozUlr).
 *   - Lead 10016 con tracking_uuid='F6sgOiV4mN0zuJI_' y phone E.164.
 *   - trainer_preferences.preferences.trainerEmail poblado y suscrito a appointment_booked.
 */

import pino from 'pino';
import { getSupabase } from '../src/lib/supabase.js';
import { handleCalendarEvent } from '../src/routes/webhook-ghl-calendar.js';
import { processNotificationQueue } from '../src/services/notify-trainer.js';

const TENANT_ID = 3;
const LEAD_TRACKING_UUID = 'F6sgOiV4mN0zuJI_';
const CALENDAR_EXTERNAL_ID = 'iSfmemtdB9kwOU5ozUlr';
const FAKE_LOCATION_ID = 'smoke-location-ivan-sandbox';
const APPOINTMENT_ID = `smoke-${Date.now()}`;

const log = pino({ level: 'info' });

function sep(title: string): void {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
}

async function main(): Promise<void> {
  const supabase = getSupabase();

  // 1. Construir fake payload AppointmentCreate al estilo GHL Marketplace
  const now = Date.now();
  const startTime = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(); // +3 días
  const endTime = new Date(now + 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
  const fakeBody = {
    type: 'AppointmentCreate' as const,
    locationId: FAKE_LOCATION_ID,
    appointment: {
      id: APPOINTMENT_ID,
      locationId: FAKE_LOCATION_ID,
      calendarId: CALENDAR_EXTERNAL_ID,
      contactId: 'fake-contact-smoke',
      appointmentStatus: 'confirmed',
      assignedUserId: null,
      notes: null,
      title: 'SMOKE Hito 10.5 — cita test',
      startTime,
      endTime,
      source: 'fyzon-smoke',
      address: null,
      customFields: [{ key: 'fyzon_lead_uuid', value: LEAD_TRACKING_UUID }],
    },
  };

  sep('1) handleCalendarEvent');
  const result = await handleCalendarEvent({
    supabase,
    ghlClient: null,
    tenantId: TENANT_ID,
    body: fakeBody,
    log,
  });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error('\nhandleCalendarEvent falló. Aborto smoke.');
    process.exit(1);
  }
  if (result.ignored) {
    console.error(`\nhandleCalendarEvent ignored (${result.reason}). Aborto smoke.`);
    process.exit(1);
  }

  sep('2) calendar_appointments (UPSERTed row)');
  const { data: apptRow } = await supabase
    .from('calendar_appointments')
    .select(
      'id, lead_id, conversation_id, match_method, match_confidence, appointment_status, start_at, end_at, title',
    )
    .eq('external_appointment_id', APPOINTMENT_ID)
    .maybeSingle();
  console.log(apptRow);

  if (apptRow?.conversation_id) {
    sep('3) conversation post-applier (esperado: phase=7, handoff A_agenda, IA infinity)');
    const { data: conv } = await supabase
      .from('conversations')
      .select(
        'id, phase_number, is_handoff_to_human, handoff_cause, ai_paused_until, call_scheduled_at, last_appointment_id',
      )
      .eq('id', apptRow.conversation_id)
      .maybeSingle();
    console.log(conv);
  } else {
    console.log('  (sin conversation_id — booking huérfano o match falló)');
  }

  sep('4) notification_events (pending pre-cron)');
  const { data: notifBefore } = await supabase
    .from('notification_events')
    .select('id, event_type, status, attempts, created_at, sent_at, payload')
    .eq('tenant_id', TENANT_ID)
    .eq('event_type', 'appointment_booked')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log({
    id: notifBefore?.id,
    status: notifBefore?.status,
    attempts: notifBefore?.attempts,
    payload_sample: notifBefore?.payload
      ? {
          unmatched: (notifBefore.payload as Record<string, unknown>).unmatched,
          lead_first_name: (notifBefore.payload as Record<string, unknown>).lead_first_name,
          channel_kind: (notifBefore.payload as Record<string, unknown>).channel_kind,
          channel_handle: (notifBefore.payload as Record<string, unknown>).channel_handle,
          calendar_name: (notifBefore.payload as Record<string, unknown>).calendar_name,
        }
      : null,
  });

  if (!notifBefore) {
    console.error('\n❌ No se encoló notification_events. Aborto.');
    process.exit(1);
  }

  sep('5) processNotificationQueue (simula cron notify-tick)');
  const processed = await processNotificationQueue({
    supabase: supabase as Parameters<typeof processNotificationQueue>[0]['supabase'],
    log,
  });
  console.log(processed);

  sep('6) notification_events post-proceso');
  const { data: notifAfter } = await supabase
    .from('notification_events')
    .select('id, status, attempts, sent_at, resend_message_id, last_error')
    .eq('id', notifBefore.id)
    .maybeSingle();
  console.log(notifAfter);

  console.log('\n');
  if (notifAfter?.status === 'sent' && notifAfter?.resend_message_id) {
    console.log('✅ ÉXITO — email enviado a Resend');
    console.log(`   Resend message ID: ${notifAfter.resend_message_id}`);
    console.log('   Revisa fyzon.ia@gmail.com (puede tardar 30-60s en llegar)');
  } else if (notifAfter?.status === 'skipped') {
    console.log(`⚠️  SKIPPED — ${notifAfter.last_error}`);
  } else if (notifAfter?.status === 'pending') {
    console.log('⚠️  PENDING — el cron no lo procesó (raro, mira los logs arriba).');
  } else {
    console.log(`❌ STATUS=${notifAfter?.status}, error=${notifAfter?.last_error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSMOKE FAILED:', err);
    process.exit(1);
  });
