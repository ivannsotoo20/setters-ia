/**
 * Hito 10.6 — API Booking action: cuando el setter rellena `proposed_booking_slot`,
 * el motor reserva la cita en GHL vía API.
 *
 * Flow:
 *  1. Carga el calendar default del tenant + lead.ghl_contact_id (o
 *     conversations.ghl_contact_id).
 *  2. Llama `ghlClient.createAppointment({calendarId, contactId, startTime})`.
 *  3. GHL dispara webhook `AppointmentCreate` al motor → applier hace F7 + email.
 *
 * Best-effort: si falla (slot conflict, GHL down, lead sin contactId), log
 * y continúa. El bot ya envió el mensaje de confirmación al lead — si no
 * funcionó la reserva, el siguiente turno detectará el problema y re-propondrá.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlClient } from '@fyzon/ghl-client';
import { GhlSlotConflictError } from '@fyzon/ghl-client';
import { logger } from '../lib/logger.js';

export interface BookAppointmentInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  conversationId: number;
  /** ISO 8601 con offset que el setter rellenó en proposed_booking_slot. */
  slotIso: string;
  /** Nombre legible del lead para el título de la cita en GHL. */
  leadFirstName?: string | null;
  /** Nombre del tenant para el título. */
  tenantName?: string | null;
}

export type BookAppointmentResult =
  | { ok: true; appointmentId: string; ghlContactId: string }
  | { ok: false; reason: 'no_ghl_contact_id' | 'no_calendar' | 'slot_conflict' | 'api_error' | 'invalid_slot'; error?: string };

export async function bookAppointmentFromSlot(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const { supabase, ghlClient, tenantId, conversationId, slotIso, leadFirstName, tenantName } = input;

  // 1. Validar ISO 8601
  if (!isValidIso8601(slotIso)) {
    logger.warn({ tenantId, conversationId, slotIso }, 'bookAppointmentFromSlot: slotIso inválido');
    return { ok: false, reason: 'invalid_slot', error: `slot no parseable: ${slotIso}` };
  }

  // 2. Cargar ghl_contact_id de la conv (lo populamos automáticamente con cada
  //    mensaje GHL — para F6 ya debería estar)
  const { data: conv } = await supabase
    .from('conversations')
    .select('ghl_contact_id')
    .eq('id', conversationId)
    .maybeSingle();
  const ghlContactId = (conv?.ghl_contact_id as string | null | undefined) ?? null;
  if (!ghlContactId) {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: conv sin ghl_contact_id');
    return { ok: false, reason: 'no_ghl_contact_id' };
  }

  // 3. Cargar calendar default del tenant
  const { data: cal } = await supabase
    .from('calendar_accounts')
    .select('external_calendar_id, name')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (!cal?.external_calendar_id) {
    logger.warn({ tenantId, conversationId }, 'bookAppointmentFromSlot: tenant sin calendar default');
    return { ok: false, reason: 'no_calendar' };
  }

  // 4. Llamar createAppointment
  const title = buildAppointmentTitle({ tenantName, leadFirstName });
  try {
    const appt = await ghlClient.createAppointment({
      calendarId: String(cal.external_calendar_id),
      contactId: ghlContactId,
      startTime: slotIso,
      title,
      appointmentStatus: 'confirmed',
    });
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
    return { ok: true, appointmentId: appt.id, ghlContactId };
  } catch (err) {
    if (err instanceof GhlSlotConflictError) {
      logger.warn(
        { tenantId, conversationId, slot: slotIso, status: err.status },
        'bookAppointmentFromSlot: slot conflict (otro lead reservó o slot inválido)',
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
