/**
 * Appointment applier (Hito 10).
 *
 * Aplica el efecto de un evento de cita (AppointmentCreate/Update/Delete) sobre:
 *  - `calendar_appointments` (UPSERT del mirror local)
 *  - `conversations` (mover a F7 + pausar IA + handoff cause A_agenda) si matched
 *  - `pipeline_events` (log F<old>→F7 phase_change)
 *
 * Reglas:
 *   - AppointmentCreate matched   → phase=7, call_scheduled_at, handoff A, IA pausada infinity.
 *   - AppointmentUpdate cancelled → appointment_status updated, pero NO se mueve la conv atrás (es outcome).
 *   - AppointmentDelete           → appointment_status='cancelled' (best-effort); registro mantenido.
 *   - Sin lead matched (unmatched) → solo UPSERT calendar_appointments con lead_id NULL.
 *   - Idempotente: re-ejecutar con el mismo payload no duplica eventos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlAppointment } from '@fyzon/ghl-client';
import type { MatchResult } from './appointment-matcher.js';

export type AppointmentEventType = 'AppointmentCreate' | 'AppointmentUpdate' | 'AppointmentDelete';

export interface ApplyInput {
  supabase: SupabaseClient;
  tenantId: number;
  calendarAccountId: number;
  eventType: AppointmentEventType;
  appointment: GhlAppointment;
  match: MatchResult;
  rawPayload: unknown;
}

export interface ApplyResult {
  appointmentLocalId: number;
  conversationMoved: boolean;
  previousPhase: number | null;
  newPhase: number | null;
}

const F7_PHASE_NUMBER = 7;

export async function applyAppointmentToConversation(input: ApplyInput): Promise<ApplyResult> {
  const { supabase, tenantId, calendarAccountId, eventType, appointment, match, rawPayload } = input;

  // Status semántica: Delete fuerza 'cancelled'; los demás respetan el payload.
  const status =
    eventType === 'AppointmentDelete'
      ? 'cancelled'
      : normalizeStatus(appointment.appointmentStatus);

  // 1. UPSERT calendar_appointments
  const upsertRow = {
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
    source: appointment.source ?? null,
    match_method: match.method,
    match_confidence: match.confidence,
    notes: appointment.notes ?? null,
    payload: rawPayload as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from('calendar_appointments')
    .upsert(upsertRow, { onConflict: 'tenant_id,external_appointment_id' })
    .select('id')
    .single();

  if (upsertErr || !upserted) {
    throw new Error(`applyAppointment: upsert failed: ${upsertErr?.message ?? 'no row returned'}`);
  }
  const appointmentLocalId = Number(upserted.id);

  // Si no hay lead matched, NO modificamos conversación. Booking huérfano.
  if (match.leadId == null || match.conversationId == null) {
    return {
      appointmentLocalId,
      conversationMoved: false,
      previousPhase: null,
      newPhase: null,
    };
  }

  // 2. Solo Create + status nuevo/confirmado → mover conversación a F7
  const shouldMoveToF7 =
    eventType === 'AppointmentCreate' &&
    (status === 'new' || status === 'confirmed');

  // 2.b Update/Delete con cancelled/noshow/invalid → revocar handoff_cause='A_agenda'
  //     si la conv lo tenía. Razón: la cita asociada ya no existe → el handoff
  //     "lead reservó" pierde validez. Reactivamos la IA para que el lead pueda
  //     reagendar sin intervención manual del trainer. Mantenemos phase_number
  //     (no retrocedemos automáticamente; el trainer decide).
  //     (Bug detectado 2026-05-16: webhook AppointmentDelete dejaba conversación
  //      con is_handoff_to_human=true zombie aunque cita ya no existiera).
  const isCancellationStatus =
    status === 'cancelled' || status === 'noshow' || status === 'invalid';

  if (!shouldMoveToF7) {
    if (isCancellationStatus) {
      // Mirar si la conv tenía handoff por agenda; si sí, revocarlo.
      const { data: convCurrent } = await supabase
        .from('conversations')
        .select('handoff_cause')
        .eq('id', match.conversationId)
        .maybeSingle();
      const shouldRevokeHandoff = convCurrent?.handoff_cause === 'A_agenda';

      if (shouldRevokeHandoff) {
        await supabase
          .from('conversations')
          .update({
            last_appointment_id: appointmentLocalId,
            is_handoff_to_human: false,
            handoff_cause: null,
            handoff_at: null,
            handoff_reason: null,
            ai_paused_until: null,
          })
          .eq('id', match.conversationId);

        return {
          appointmentLocalId,
          conversationMoved: false,
          previousPhase: null,
          newPhase: null,
        };
      }
    }

    // Caso fallback: solo actualizar conversations.last_appointment_id (link al mirror local)
    await supabase
      .from('conversations')
      .update({ last_appointment_id: appointmentLocalId })
      .eq('id', match.conversationId);

    return {
      appointmentLocalId,
      conversationMoved: false,
      previousPhase: null,
      newPhase: null,
    };
  }

  // 3. Mover conversación a F7 + pausar IA + handoff cause A
  const { data: convBefore } = await supabase
    .from('conversations')
    .select('phase_number')
    .eq('id', match.conversationId)
    .maybeSingle();
  const previousPhase = convBefore?.phase_number ?? null;

  if (previousPhase === F7_PHASE_NUMBER) {
    // Ya estaba en F7 — no-op de fase, pero refrescar metadata.
    await supabase
      .from('conversations')
      .update({
        call_scheduled_at: appointment.startTime,
        last_appointment_id: appointmentLocalId,
      })
      .eq('id', match.conversationId);
    return {
      appointmentLocalId,
      conversationMoved: false,
      previousPhase,
      newPhase: F7_PHASE_NUMBER,
    };
  }

  const { error: updErr } = await supabase
    .from('conversations')
    .update({
      phase_number: F7_PHASE_NUMBER,
      call_scheduled_at: appointment.startTime,
      is_call_scheduling_link_sent: true,
      is_handoff_to_human: true,
      handoff_cause: 'A_agenda',
      ai_paused_until: 'infinity',
      last_appointment_id: appointmentLocalId,
    })
    .eq('id', match.conversationId);

  if (updErr) {
    throw new Error(`applyAppointment: conversation update failed: ${updErr.message}`);
  }

  // 4. pipeline_events log — idempotente. Hardening 2026-05-15 audit MEDIUM
  //    M-12: si el webhook se repite en <5min (ej. backfill + webhook simultáneo,
  //    o reconciliation re-aplicando), NO duplicar el row de phase_change.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: existingEvent } = await supabase
    .from('pipeline_events')
    .select('id')
    .eq('conversation_id', match.conversationId)
    .eq('event_type', 'phase_change')
    .eq('to_value', `F${F7_PHASE_NUMBER}`)
    .gte('occurred_at', fiveMinAgo)
    .limit(1)
    .maybeSingle();

  if (!existingEvent) {
    await supabase.from('pipeline_events').insert({
      tenant_id: tenantId,
      conversation_id: match.conversationId,
      event_type: 'phase_change',
      from_value: previousPhase != null ? `F${previousPhase}` : null,
      to_value: `F${F7_PHASE_NUMBER}`,
      source: 'calendar_webhook',
      occurred_at: new Date().toISOString(),
    });
  }

  return {
    appointmentLocalId,
    conversationMoved: true,
    previousPhase,
    newPhase: F7_PHASE_NUMBER,
  };
}

function normalizeStatus(s: string | null | undefined): string {
  if (!s) return 'new';
  const v = String(s).toLowerCase();
  if (v === 'new' || v === 'confirmed' || v === 'cancelled' || v === 'showed' || v === 'noshow' || v === 'invalid') {
    return v;
  }
  // GHL a veces envía 'canceled' (variante US)
  if (v === 'canceled') return 'cancelled';
  return 'new';
}
