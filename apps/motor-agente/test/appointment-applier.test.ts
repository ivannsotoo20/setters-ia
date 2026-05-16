import { describe, it, expect } from 'vitest';
import { applyAppointmentToConversation } from '../src/services/appointment-applier.js';
import type { GhlAppointment } from '@fyzon/ghl-client';

/**
 * Tests del appointment applier (Hito 10).
 *
 * Cobertura focal: bug fix 2026-05-16 — un AppointmentUpdate/Delete con
 * appointment_status='cancelled' debe REVOCAR el handoff A_agenda previo
 * (no dejarlo zombie en is_handoff_to_human=true con cita ya inexistente).
 */

interface ConvRow {
  id: number;
  phase_number: number | null;
  handoff_cause: string | null;
  is_handoff_to_human: boolean;
}

interface AppointmentRow {
  id: number;
  external_appointment_id: string;
  appointment_status: string;
}

function makeSupabaseStub(opts: {
  conv: ConvRow;
  existingAppointment?: AppointmentRow | null;
  capturedUpdates: Array<{ table: string; payload: Record<string, unknown>; filter: [string, unknown] }>;
  capturedUpserts: Array<{ table: string; payload: Record<string, unknown> }>;
  capturedInserts: Array<{ table: string; payload: Record<string, unknown> }>;
}) {
  const conv = opts.conv;

  return {
    from(table: string) {
      const builder = {
        select(_cols?: string) {
          return builder;
        },
        eq(_col: string, _val: unknown) {
          return builder;
        },
        gte(_col: string, _val: unknown) {
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        async maybeSingle() {
          if (table === 'conversations') {
            return { data: conv, error: null };
          }
          if (table === 'pipeline_events') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              opts.capturedUpdates.push({ table, payload, filter: [col, val] });
              return Promise.resolve({ error: null });
            },
          };
        },
        upsert(payload: Record<string, unknown>, _opts?: unknown) {
          opts.capturedUpserts.push({ table, payload });
          return {
            select: (_cols: string) => ({
              single: async () => ({ data: { id: 999 }, error: null }),
            }),
          };
        },
        insert(payload: Record<string, unknown>) {
          opts.capturedInserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

function fakeAppointment(overrides?: Partial<GhlAppointment>): GhlAppointment {
  return {
    id: 'ghl-appt-test-001',
    contactId: 'ghl-contact-001',
    calendarId: 'cal-001',
    appointmentStatus: 'confirmed',
    startTime: '2026-05-20T10:00:00Z',
    endTime: '2026-05-20T10:30:00Z',
    title: 'Test appointment',
    assignedUserId: null,
    source: 'booking_widget',
    notes: null,
    ...overrides,
  } as GhlAppointment;
}

describe('applyAppointmentToConversation — handoff revocation on cancellation', () => {
  it('AppointmentDelete con cancelled REVOCA handoff_cause=A_agenda previo', async () => {
    const capturedUpdates: Array<{
      table: string;
      payload: Record<string, unknown>;
      filter: [string, unknown];
    }> = [];
    const capturedUpserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

    const supabase = makeSupabaseStub({
      conv: { id: 100, phase_number: 7, handoff_cause: 'A_agenda', is_handoff_to_human: true },
      capturedUpdates,
      capturedUpserts,
      capturedInserts,
    });

    const result = await applyAppointmentToConversation({
      supabase,
      tenantId: 3,
      calendarAccountId: 1,
      eventType: 'AppointmentDelete',
      appointment: fakeAppointment({ appointmentStatus: 'cancelled' }),
      match: { leadId: 200, conversationId: 100, method: 'phone', confidence: 80 },
      rawPayload: { type: 'AppointmentDelete' },
    });

    expect(result.conversationMoved).toBe(false);
    // Debe haber un UPDATE conversations con revocación completa
    const revokeUpdate = capturedUpdates.find(
      (u) => u.table === 'conversations' && u.payload.is_handoff_to_human === false,
    );
    expect(revokeUpdate).toBeDefined();
    expect(revokeUpdate?.payload).toMatchObject({
      is_handoff_to_human: false,
      handoff_cause: null,
      handoff_at: null,
      handoff_reason: null,
      ai_paused_until: null,
    });
  });

  it('AppointmentUpdate con noshow REVOCA handoff_cause=A_agenda previo', async () => {
    const capturedUpdates: Array<{
      table: string;
      payload: Record<string, unknown>;
      filter: [string, unknown];
    }> = [];
    const capturedUpserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

    const supabase = makeSupabaseStub({
      conv: { id: 101, phase_number: 7, handoff_cause: 'A_agenda', is_handoff_to_human: true },
      capturedUpdates,
      capturedUpserts,
      capturedInserts,
    });

    await applyAppointmentToConversation({
      supabase,
      tenantId: 3,
      calendarAccountId: 1,
      eventType: 'AppointmentUpdate',
      appointment: fakeAppointment({ appointmentStatus: 'noshow' }),
      match: { leadId: 201, conversationId: 101, method: 'phone', confidence: 80 },
      rawPayload: {},
    });

    const revokeUpdate = capturedUpdates.find(
      (u) => u.table === 'conversations' && u.payload.is_handoff_to_human === false,
    );
    expect(revokeUpdate).toBeDefined();
  });

  it('AppointmentDelete con cancelled NO toca handoff si la conv no estaba en A_agenda', async () => {
    const capturedUpdates: Array<{
      table: string;
      payload: Record<string, unknown>;
      filter: [string, unknown];
    }> = [];
    const capturedUpserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

    const supabase = makeSupabaseStub({
      conv: { id: 102, phase_number: 3, handoff_cause: 'B_derivacion', is_handoff_to_human: true },
      capturedUpdates,
      capturedUpserts,
      capturedInserts,
    });

    await applyAppointmentToConversation({
      supabase,
      tenantId: 3,
      calendarAccountId: 1,
      eventType: 'AppointmentDelete',
      appointment: fakeAppointment({ appointmentStatus: 'cancelled' }),
      match: { leadId: 202, conversationId: 102, method: 'phone', confidence: 80 },
      rawPayload: {},
    });

    // No debe haber update con is_handoff_to_human=false (la conv tenía B_derivacion, no A_agenda)
    const revokeUpdate = capturedUpdates.find(
      (u) => u.table === 'conversations' && u.payload.is_handoff_to_human === false,
    );
    expect(revokeUpdate).toBeUndefined();
  });

  it('AppointmentCreate confirmed APLICA handoff A_agenda + mueve a F7 (no regresión)', async () => {
    const capturedUpdates: Array<{
      table: string;
      payload: Record<string, unknown>;
      filter: [string, unknown];
    }> = [];
    const capturedUpserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

    const supabase = makeSupabaseStub({
      conv: { id: 103, phase_number: 4, handoff_cause: null, is_handoff_to_human: false },
      capturedUpdates,
      capturedUpserts,
      capturedInserts,
    });

    const result = await applyAppointmentToConversation({
      supabase,
      tenantId: 3,
      calendarAccountId: 1,
      eventType: 'AppointmentCreate',
      appointment: fakeAppointment({ appointmentStatus: 'confirmed' }),
      match: { leadId: 203, conversationId: 103, method: 'fyzon_uuid', confidence: 100 },
      rawPayload: {},
    });

    expect(result.conversationMoved).toBe(true);
    expect(result.newPhase).toBe(7);
    const applyHandoff = capturedUpdates.find(
      (u) => u.table === 'conversations' && u.payload.is_handoff_to_human === true,
    );
    expect(applyHandoff).toBeDefined();
    expect(applyHandoff?.payload.handoff_cause).toBe('A_agenda');
  });
});
