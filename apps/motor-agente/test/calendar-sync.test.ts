import { describe, it, expect, vi } from 'vitest';
import type { GhlAppointment } from '@fyzon/ghl-client';

/**
 * Calendar sync (2026-09-12) — las citas de GHL entran al SaaS aunque no haya
 * webhook (cuentas PIT como la de Tania).
 *
 * El applier y el matcher se sustituyen por espías: aquí se prueba la decisión
 * (nueva / cambiada / huérfana / desaparecida), no el UPSERT.
 */

const applyMock = vi.fn(async () => ({
  appointmentLocalId: 1,
  conversationMoved: true,
  previousPhase: 6,
  newPhase: 7,
}));
const matchMock = vi.fn(async () => ({
  leadId: 501,
  conversationId: 9001,
  method: 'ghl_contact_id' as const,
  confidence: 95,
}));
const notifyPayloadMock = vi.fn(async () => ({ unmatched: false }));
const enqueueMock = vi.fn(async () => ({ ok: true as const, id: 1 }));

vi.mock('../src/services/appointment-applier.js', () => ({
  applyAppointmentToConversation: (...args: unknown[]) => applyMock(...(args as [])),
}));
vi.mock('../src/services/appointment-matcher.js', () => ({
  matchLeadFromAppointment: (...args: unknown[]) => matchMock(...(args as [])),
}));
vi.mock('../src/services/build-appointment-notification-payload.js', () => ({
  buildAppointmentBookedPayload: (...args: unknown[]) => notifyPayloadMock(...(args as [])),
}));
vi.mock('../src/services/notify-trainer.js', () => ({
  enqueueNotification: (...args: unknown[]) => enqueueMock(...(args as [])),
}));
vi.mock('../src/lib/load-ghl-client.js', () => ({
  loadGhlClientByTenant: async () => null,
}));

import { syncCalendarAppointments } from '../src/services/calendar-sync.js';

const CAL = { id: 3, tenant_id: 7, external_calendar_id: 'wC54o4jXWdev4UDKsOka', name: 'Agenda IG' };

function appt(id: string, status: GhlAppointment['appointmentStatus'] = 'confirmed'): GhlAppointment {
  return {
    id,
    calendarId: CAL.external_calendar_id,
    contactId: `contact_${id}`,
    appointmentStatus: status,
    startTime: '2026-09-15T10:00:00.000Z',
    endTime: '2026-09-15T10:30:00.000Z',
    dateAdded: '2026-09-12T09:00:00.000Z',
  };
}

function makeSupabase(knownRows: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        lte: () => builder,
        then: undefined,
      };
      if (table === 'calendar_accounts') {
        // La query se consume con `await`: devolvemos un thenable.
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: [CAL], error: null });
        return builder;
      }
      if (table === 'calendar_appointments') {
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: knownRows, error: null });
        return builder;
      }
      throw new Error(`fake supabase: tabla inesperada ${table}`);
    },
  } as any;
}

function makeGhl(appointments: GhlAppointment[]) {
  return {
    listAppointmentsByCalendar: vi.fn(async () => appointments),
  } as any;
}

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function reset() {
  applyMock.mockClear();
  matchMock.mockClear();
  notifyPayloadMock.mockClear();
  enqueueMock.mockClear();
  log.info.mockClear();
  log.warn.mockClear();
}

describe('syncCalendarAppointments', () => {
  it('una cita nueva en GHL se matchea, se aplica como AppointmentCreate y avisa a la entrenadora', async () => {
    reset();
    const ghl = makeGhl([appt('A1')]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([]),
      log,
      ghlClientFactory: async () => ghl,
    });

    expect(r.calendarsScanned).toBe(1);
    expect(r.fetched).toBe(1);
    expect(r.created).toBe(1);
    expect(matchMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledTimes(1);
    const call = applyMock.mock.calls[0]![0] as any;
    expect(call.eventType).toBe('AppointmentCreate');
    expect(call.calendarAccountId).toBe(3);
    expect(call.tenantId).toBe(7);
    expect(call.appointment.id).toBe('A1');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect((enqueueMock.mock.calls[0]![0] as any).eventType).toBe('appointment_booked');
    expect(r.errors).toEqual([]);
  });

  it('una cita ya conocida sin cambios no escribe nada', async () => {
    reset();
    const ghl = makeGhl([appt('A1', 'confirmed')]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([
        {
          id: 10,
          external_appointment_id: 'A1',
          external_contact_id: 'contact_A1',
          appointment_status: 'confirmed',
          lead_id: 501,
          conversation_id: 9001,
          match_method: 'ghl_contact_id',
          match_confidence: 95,
          start_at: '2026-09-15T10:00:00.000Z',
          end_at: '2026-09-15T10:30:00.000Z',
        },
      ]),
      log,
      ghlClientFactory: async () => ghl,
    });
    expect(r.created + r.updated + r.rematched + r.cancelled).toBe(0);
    expect(applyMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('un cambio de estado se aplica como AppointmentUpdate con el match que ya teníamos', async () => {
    reset();
    const ghl = makeGhl([appt('A1', 'cancelled')]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([
        {
          id: 10,
          external_appointment_id: 'A1',
          external_contact_id: 'contact_A1',
          appointment_status: 'confirmed',
          lead_id: 501,
          conversation_id: 9001,
          match_method: 'ghl_contact_id',
          match_confidence: 95,
          start_at: '2026-09-15T10:00:00.000Z',
          end_at: '2026-09-15T10:30:00.000Z',
        },
      ]),
      log,
      ghlClientFactory: async () => ghl,
    });
    expect(r.updated).toBe(1);
    const call = applyMock.mock.calls[0]![0] as any;
    expect(call.eventType).toBe('AppointmentUpdate');
    expect(call.match.conversationId).toBe(9001);
    expect(matchMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('una cita huérfana se vuelve a matchear y, si ahora casa, se aplica', async () => {
    reset();
    const ghl = makeGhl([appt('A1')]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([
        {
          id: 10,
          external_appointment_id: 'A1',
          external_contact_id: 'contact_A1',
          appointment_status: 'confirmed',
          lead_id: null,
          conversation_id: null,
          match_method: 'unmatched',
          match_confidence: 0,
          start_at: '2026-09-15T10:00:00.000Z',
          end_at: '2026-09-15T10:30:00.000Z',
        },
      ]),
      log,
      ghlClientFactory: async () => ghl,
    });
    expect(r.rematched).toBe(1);
    expect(matchMock).toHaveBeenCalledTimes(1);
    expect((applyMock.mock.calls[0]![0] as any).eventType).toBe('AppointmentCreate');
  });

  it('una cita que GHL ya no devuelve se cancela (AppointmentDelete)', async () => {
    reset();
    const ghl = makeGhl([appt('A2')]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([
        {
          id: 10,
          external_appointment_id: 'A1',
          external_contact_id: 'contact_A1',
          appointment_status: 'confirmed',
          lead_id: 501,
          conversation_id: 9001,
          match_method: 'ghl_contact_id',
          match_confidence: 95,
          start_at: '2026-09-15T10:00:00.000Z',
          end_at: '2026-09-15T10:30:00.000Z',
        },
      ]),
      log,
      ghlClientFactory: async () => ghl,
    });
    expect(r.created).toBe(1); // A2 nueva
    expect(r.cancelled).toBe(1); // A1 desaparecida
    const del = applyMock.mock.calls.find((c) => (c[0] as any).eventType === 'AppointmentDelete')![0] as any;
    expect(del.appointment.id).toBe('A1');
    expect(del.match.conversationId).toBe(9001);
  });

  it('con GHL devolviendo 0 citas y filas en BD, no reconcilia (posible fallo transitorio)', async () => {
    reset();
    const ghl = makeGhl([]);
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([
        {
          id: 10,
          external_appointment_id: 'A1',
          external_contact_id: null,
          appointment_status: 'confirmed',
          lead_id: 501,
          conversation_id: 9001,
          match_method: 'ghl_contact_id',
          match_confidence: 95,
          start_at: '2026-09-15T10:00:00.000Z',
          end_at: '2026-09-15T10:30:00.000Z',
        },
      ]),
      log,
      ghlClientFactory: async () => ghl,
    });
    expect(r.cancelled).toBe(0);
    expect(applyMock).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('un tenant sin credenciales GHL se omite sin romper el tick', async () => {
    reset();
    const r = await syncCalendarAppointments({
      supabase: makeSupabase([]),
      log,
      ghlClientFactory: async () => null,
    });
    expect(r.tenantsScanned).toBe(1);
    expect(r.tenantsWithoutClient).toBe(1);
    expect(r.calendarsScanned).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it('con notify=false no encola emails (backfills)', async () => {
    reset();
    const ghl = makeGhl([appt('A1')]);
    await syncCalendarAppointments({
      supabase: makeSupabase([]),
      log,
      ghlClientFactory: async () => ghl,
      notify: false,
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
