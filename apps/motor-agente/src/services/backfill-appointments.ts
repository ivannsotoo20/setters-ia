/**
 * Backfill de citas desde GHL al SaaS (Hito 10 — A).
 *
 * Útil para hacer aparecer en `/calendars` las citas que ya existen en GHL antes
 * de que la app Marketplace estuviera suscrita a los webhooks `AppointmentCreate`.
 *
 * Flujo:
 *   1. Carga calendar_account vinculado.
 *   2. Llama `GET /calendars/events?calendarId=...&startTime=...&endTime=...` via GhlClient.
 *   3. Para cada appointment: matcha al lead (UUID custom field → phone fallback) + UPSERT en `calendar_appointments`.
 *   4. NO toca `conversations` (a diferencia del webhook live, el backfill es solo historial visible).
 *      Si el trainer quiere mover una conversación al kanban F7 manualmente, lo hace desde el chat.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlAppointment, GhlClient } from '@fyzon/ghl-client';
import { matchLeadFromAppointment } from './appointment-matcher.js';

export interface BackfillInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  calendarAccountId: number;
  externalCalendarId: string;
  startTime: string; // ISO
  endTime: string;   // ISO
}

export interface BackfillResult {
  calendarAccountId: number;
  fetched: number;
  upserted: number;
  matched: number;
  unmatched: number;
  /**
   * Citas que estaban en BD dentro del rango pero ya no aparecen en GHL events
   * → marcadas como cancelled. GHL filtra las canceladas/eliminadas de /events,
   * así que esa ausencia es la señal de que el trainer las canceló.
   */
  reconciled: number;
  errors: string[];
}

export async function backfillCalendarAppointments(
  input: BackfillInput,
): Promise<BackfillResult> {
  const { supabase, ghlClient, tenantId, calendarAccountId, externalCalendarId, startTime, endTime } = input;
  const result: BackfillResult = {
    calendarAccountId,
    fetched: 0,
    upserted: 0,
    matched: 0,
    unmatched: 0,
    reconciled: 0,
    errors: [],
  };

  let appointments: GhlAppointment[];
  try {
    appointments = await ghlClient.listAppointmentsByCalendar(externalCalendarId, startTime, endTime);
  } catch (err) {
    result.errors.push(`listAppointments: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
  result.fetched = appointments.length;

  for (const appointment of appointments) {
    try {
      const match = await matchLeadFromAppointment({
        supabase,
        ghlClient,
        tenantId,
        appointment,
      });

      const status = normalizeStatus(appointment.appointmentStatus);
      const { error } = await supabase
        .from('calendar_appointments')
        .upsert(
          {
            tenant_id: tenantId,
            calendar_account_id: calendarAccountId,
            external_appointment_id: appointment.id,
            external_contact_id: appointment.contactId ?? null,
            lead_id: match.leadId,
            conversation_id: match.conversationId,
            title: appointment.title ?? null,
            start_at: appointment.startTime,
            end_at: appointment.endTime,
            appointment_status: status,
            assigned_user_external_id: appointment.assignedUserId ?? null,
            source: appointment.source ?? 'backfill',
            match_method: match.method,
            match_confidence: match.confidence,
            notes: appointment.notes ?? null,
            payload: appointment as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,external_appointment_id' },
        );
      if (error) {
        result.errors.push(`upsert ${appointment.id}: ${error.message}`);
        continue;
      }
      result.upserted += 1;
      if (match.method === 'unmatched') result.unmatched += 1;
      else result.matched += 1;
    } catch (err) {
      result.errors.push(`${appointment.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Reconciliation: citas en BD del rango que ya NO aparecen en GHL → cancelled.
  // GHL filtra appointments cancelados/eliminados del endpoint /events, así que
  // la ausencia tras un listado fresco es señal de cancelación.
  try {
    const fetchedIds = new Set(appointments.map((a) => a.id));
    const { data: existing, error: queryErr } = await supabase
      .from('calendar_appointments')
      .select('id, external_appointment_id, appointment_status')
      .eq('tenant_id', tenantId)
      .eq('calendar_account_id', calendarAccountId)
      .gte('start_at', startTime)
      .lte('start_at', endTime);

    if (queryErr) {
      result.errors.push(`reconciliation query: ${queryErr.message}`);
    } else if (existing && existing.length > 0) {
      const toCancel = existing.filter(
        (row) =>
          !fetchedIds.has(String(row.external_appointment_id)) &&
          row.appointment_status !== 'cancelled',
      );
      if (toCancel.length > 0) {
        const ids = toCancel.map((r) => Number(r.id));
        const { error: updErr } = await supabase
          .from('calendar_appointments')
          .update({
            appointment_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .in('id', ids);
        if (updErr) {
          result.errors.push(`reconciliation update: ${updErr.message}`);
        } else {
          result.reconciled = toCancel.length;
        }
      }
    }
  } catch (err) {
    result.errors.push(`reconciliation: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

function normalizeStatus(s: string | null | undefined): string {
  if (!s) return 'new';
  const v = String(s).toLowerCase();
  if (['new', 'confirmed', 'cancelled', 'showed', 'noshow', 'invalid'].includes(v)) return v;
  if (v === 'canceled') return 'cancelled';
  return 'new';
}
