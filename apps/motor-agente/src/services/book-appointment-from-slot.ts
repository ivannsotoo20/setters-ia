/**
 * Hito 10.6 — API Booking action: cuando el setter rellena `proposed_booking_slot`,
 * el motor reserva la cita en GHL vía API.
 *
 * Flow:
 *  1. Valida que el lead tenga email + first_name en BD (PRE-REQUISITO).
 *  2. Carga el calendar default del tenant + ghl_contact_id de la conv.
 *  3. (Opcional) Actualiza el contacto GHL con email/name del lead si falta.
 *  4. Llama `ghlClient.createAppointment({calendarId, contactId, startTime, ...})`.
 *  5. DISPARA EL APPLIER INLINE — GHL NO dispara webhook AppointmentCreate de
 *     vuelta al motor para citas creadas vía su propia API (descubierto smoke
 *     2026-05-17: la cita aparece en GHL UI + email confirm al owner, pero el
 *     webhook nunca llega al motor → calendar_appointments queda vacío, conv
 *     no pasa a F7, email al trainer no se manda). Solución: replicar lo que
 *     el applier haría (UPSERT calendar_appointments + UPDATE conv + enqueue
 *     notification appointment_booked).
 *
 * Si la validación falla (lead sin email/name) o GHL rechaza el slot → no se
 * crea cita y devuelve `ok: false` con razón. Caller (process-debounced) debe
 * manejar el caso (el bot ya mandó "te agendo" al lead — eso queda como deuda
 * V2: cancelar message_schedules en error).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlClient } from '@fyzon/ghl-client';
import { GhlSlotConflictError } from '@fyzon/ghl-client';
import { logger } from '../lib/logger.js';
import { enqueueNotification } from './notify-trainer.js';

const F7_PHASE_NUMBER = 7;

export interface BookAppointmentInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  conversationId: number;
  /** ISO 8601 con offset que el setter rellenó en proposed_booking_slot. */
  slotIso: string;
  /** Nombre legible del lead para el título de la cita en GHL. */
  leadFirstName?: string | null;
  /** Email del lead — REQUIRED. Si null, devolvemos error 'missing_email'. */
  leadEmail?: string | null;
  /** Nombre del tenant para el título. */
  tenantName?: string | null;
}

export type BookAppointmentResult =
  | {
      ok: true;
      appointmentId: string;
      ghlContactId: string;
      calendarAppointmentLocalId: number;
      movedToF7: boolean;
    }
  | {
      ok: false;
      reason:
        | 'missing_email'
        | 'missing_name'
        | 'no_ghl_contact_id'
        | 'no_calendar'
        | 'slot_conflict'
        | 'api_error'
        | 'invalid_slot';
      error?: string;
    };

export async function bookAppointmentFromSlot(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const { supabase, ghlClient, tenantId, conversationId, slotIso, leadFirstName, leadEmail, tenantName } = input;

  // 0. Validar ISO 8601
  if (!isValidIso8601(slotIso)) {
    logger.warn({ tenantId, conversationId, slotIso }, 'bookAppointmentFromSlot: slotIso inválido');
    return { ok: false, reason: 'invalid_slot', error: `slot no parseable: ${slotIso}` };
  }

  // 1. Validar email + name (PRE-REQUISITO doctrinal — sin esos datos GHL no
  //    puede notificar al lead y la cita es inútil).
  if (!leadEmail || leadEmail.trim() === '') {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: lead sin email — abortando');
    return { ok: false, reason: 'missing_email' };
  }
  if (!leadFirstName || leadFirstName.trim() === '') {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: lead sin first_name — abortando');
    return { ok: false, reason: 'missing_name' };
  }

  // 2. Cargar ghl_contact_id de la conv
  const { data: conv } = await supabase
    .from('conversations')
    .select('ghl_contact_id, lead_id')
    .eq('id', conversationId)
    .maybeSingle();
  const ghlContactId = (conv?.ghl_contact_id as string | null | undefined) ?? null;
  if (!ghlContactId) {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: conv sin ghl_contact_id');
    return { ok: false, reason: 'no_ghl_contact_id' };
  }
  const leadId = (conv?.lead_id as number | null | undefined) ?? null;

  // 3. Cargar calendar default + integration account id
  const { data: cal } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (!cal?.external_calendar_id) {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: tenant sin calendar default');
    return { ok: false, reason: 'no_calendar' };
  }

  // 4. Sincronizar email/name al contacto GHL existente (PUT /contacts/{id}).
  //    GHL usa el email del contacto para mandar la confirmación al lead.
  //    Usamos updateContact (no upsertContact) para evitar crear contactos
  //    duplicados — actualizamos por contactId directamente.
  try {
    await ghlClient.updateContact(ghlContactId, {
      email: leadEmail,
      firstName: leadFirstName,
    });
  } catch (err) {
    logger.warn(
      { tenantId, conversationId, err: err instanceof Error ? err.message : String(err) },
      'bookAppointmentFromSlot: updateContact failed (non-fatal, sigue con createAppointment)',
    );
  }

  // 5. Crear cita en GHL
  const title = buildAppointmentTitle({ tenantName, leadFirstName });
  let appointmentId: string;
  let endTime: string | null = null;
  try {
    const appt = await ghlClient.createAppointment({
      calendarId: String(cal.external_calendar_id),
      contactId: ghlContactId,
      startTime: slotIso,
      title,
      appointmentStatus: 'confirmed',
    });
    appointmentId = appt.id;
    endTime = appt.endTime ?? null;
    logger.info(
      {
        tenantId,
        conversationId,
        appointmentId: appt.id,
        ghlContactId,
        slot: slotIso,
        calendar: cal.name,
      },
      'bookAppointmentFromSlot: cita creada vía GHL API',
    );
  } catch (err) {
    if (err instanceof GhlSlotConflictError) {
      logger.warn(
        { tenantId, conversationId, slot: slotIso, status: err.status },
        'bookAppointmentFromSlot: slot conflict',
      );
      return { ok: false, reason: 'slot_conflict', error: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { tenantId, conversationId, slot: slotIso, err: msg },
      'bookAppointmentFromSlot: createAppointment falló',
    );
    return { ok: false, reason: 'api_error', error: msg };
  }

  // 6. APPLIER INLINE — GHL no dispara webhook back hacia el motor para citas
  //    creadas vía API (anti-loop). Replicamos lo que el applier haría desde
  //    aquí: UPSERT calendar_appointments + UPDATE conversation a F7 + enqueue
  //    notification appointment_booked al trainer.
  const calendarAppointmentLocalId = await persistApiBookingAppointment({
    supabase,
    tenantId,
    calendarAccountLocalId: Number(cal.id),
    appointmentId,
    ghlContactId,
    leadId,
    conversationId,
    slotIso,
    endTime,
    title,
  });

  // 7. Mover conv a F7 + handoff A_agenda + IA pausada infinity
  const movedToF7 = await moveConversationToF7({
    supabase,
    conversationId,
    appointmentLocalId: calendarAppointmentLocalId,
    slotIso,
  });

  // 8. Enqueue email al trainer (idempotente — si llega webhook después, el
  //    applier detectará la fila ya existente y no duplicará el email).
  try {
    await enqueueAppointmentBookedEmail({
      supabase,
      tenantId,
      conversationId,
      leadId,
      leadFirstName,
      leadEmail,
      slotIso,
      calendarName: (cal.name as string | null) ?? null,
    });
  } catch (err) {
    logger.warn(
      { tenantId, conversationId, err: err instanceof Error ? err.message : String(err) },
      'bookAppointmentFromSlot: enqueueAppointmentBookedEmail falló (non-fatal)',
    );
  }

  return {
    ok: true,
    appointmentId,
    ghlContactId,
    calendarAppointmentLocalId,
    movedToF7,
  };
}

async function persistApiBookingAppointment(input: {
  supabase: SupabaseClient;
  tenantId: number;
  calendarAccountLocalId: number;
  appointmentId: string;
  ghlContactId: string;
  leadId: number | null;
  conversationId: number;
  slotIso: string;
  endTime: string | null;
  title: string;
}): Promise<number> {
  const upsertRow = {
    tenant_id: input.tenantId,
    calendar_account_id: input.calendarAccountLocalId,
    external_appointment_id: input.appointmentId,
    external_contact_id: input.ghlContactId,
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    title: input.title,
    start_at: input.slotIso,
    end_at: input.endTime ?? input.slotIso,
    appointment_status: 'confirmed',
    source: 'fyzon-api-booking',
    match_method: 'ghl_contact_id',
    match_confidence: 100,
    payload: {
      via: 'api-booking-inline',
      contactId: input.ghlContactId,
      slot: input.slotIso,
    } as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await input.supabase
    .from('calendar_appointments')
    .upsert(upsertRow, { onConflict: 'tenant_id,external_appointment_id' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`persistApiBookingAppointment: upsert failed: ${error?.message ?? 'no row returned'}`);
  }
  return Number(data.id);
}

async function moveConversationToF7(input: {
  supabase: SupabaseClient;
  conversationId: number;
  appointmentLocalId: number;
  slotIso: string;
}): Promise<boolean> {
  // Solo movemos a F7 si la conv NO está ya en F7 (idempotencia).
  const { data: cur } = await input.supabase
    .from('conversations')
    .select('phase_number')
    .eq('id', input.conversationId)
    .maybeSingle();
  const currentPhase = (cur?.phase_number as number | null | undefined) ?? null;

  await input.supabase
    .from('conversations')
    .update({
      phase_number: F7_PHASE_NUMBER,
      call_scheduled_at: input.slotIso,
      is_call_scheduling_link_sent: true,
      is_handoff_to_human: true,
      handoff_cause: 'A_agenda',
      ai_paused_until: 'infinity',
      last_appointment_id: input.appointmentLocalId,
    })
    .eq('id', input.conversationId);

  return currentPhase !== F7_PHASE_NUMBER;
}

async function enqueueAppointmentBookedEmail(input: {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  leadId: number | null;
  leadFirstName: string;
  leadEmail: string;
  slotIso: string;
  calendarName: string | null;
}): Promise<void> {
  // Resolver canal de la conv para el payload del email (consistente con el
  // build-appointment-notification-payload que usa el webhook applier).
  const { data: conv } = await input.supabase
    .from('conversations')
    .select('channel_id, channels:channel_id(channel_type)')
    .eq('id', input.conversationId)
    .maybeSingle();
  const channelType = (conv as { channels?: { channel_type?: string } | { channel_type?: string }[] } | null)?.channels;
  const channelKind = Array.isArray(channelType)
    ? channelType[0]?.channel_type
    : channelType?.channel_type;

  await enqueueNotification({
    supabase: input.supabase as unknown as Parameters<typeof enqueueNotification>[0]['supabase'],
    tenantId: input.tenantId,
    eventType: 'appointment_booked',
    payload: {
      unmatched: false,
      conversation_id: input.conversationId,
      lead_id: input.leadId,
      lead_first_name: input.leadFirstName,
      lead_phone: null,
      contact_email: input.leadEmail,
      channel_kind: channelKind ?? null,
      channel_handle: null,
      appointment_time: input.slotIso,
      calendar_name: input.calendarName,
      match_method: 'ghl_contact_id',
      match_confidence: 100,
      source: 'api-booking-inline',
    },
  });
}

function buildAppointmentTitle(input: { tenantName?: string | null; leadFirstName?: string | null }): string {
  const tenant = input.tenantName?.trim() || 'Fyzon';
  const lead = input.leadFirstName?.trim() || 'Lead';
  return `${tenant} — ${lead}`;
}

function isValidIso8601(s: string): boolean {
  if (typeof s !== 'string' || s.length < 10) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
