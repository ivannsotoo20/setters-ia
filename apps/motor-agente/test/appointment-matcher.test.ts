import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlAppointment } from '@fyzon/ghl-client';
import { matchLeadFromAppointment } from '../src/services/appointment-matcher.js';

/**
 * Tests del matcher (Hito 10 + Hito 10.5).
 *
 * Foco: estrategia nueva `ghl_contact_id` y su orden vs otras estrategias.
 * Mocks Supabase para devolver rows controladas según from(table).
 */

interface MockRow {
  table: string;
  rows: Array<Record<string, unknown>>;
}

/** Builder simple del SupabaseClient mock que devuelve rows según la tabla consultada. */
function mockSupabase(rowsByTable: MockRow[]): SupabaseClient {
  function from(table: string) {
    const match = rowsByTable.find((m) => m.table === table);
    const data = match?.rows ?? [];

    // Builder que soporta el chain usado por el matcher:
    //   .select(...).eq(...).eq(...).limit(N).maybeSingle()  -> single row
    //   .select(...).eq(...).eq(...).order(...).limit(N)     -> array rows
    //   .select(...).eq(...).eq(...).limit(N)                -> array rows
    const chain: any = {
      _table: table,
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        resolve({ data, error: null });
        return this;
      },
    };
    return chain;
  }

  return { from } as unknown as SupabaseClient;
}

function fakeAppointment(overrides: Partial<GhlAppointment> = {}): GhlAppointment {
  return {
    id: 'appt-test-1',
    locationId: 'loc-1',
    calendarId: 'cal-1',
    contactId: 'ghl-contact-abc',
    appointmentStatus: 'confirmed',
    assignedUserId: null,
    users: [],
    notes: null,
    title: 'Test',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    source: null,
    address: null,
    customFields: [],
    ...overrides,
  } as GhlAppointment;
}

describe('matchLeadFromAppointment — Hito 10.5 ghl_contact_id strategy', () => {
  it('matchea por ghl_contact_id cuando appointment.contactId existe en conversations.ghl_contact_id', async () => {
    const supabase = mockSupabase([
      // El matcher consulta 'conversations' filtrando ghl_contact_id
      {
        table: 'conversations',
        rows: [
          {
            id: 42,
            lead_id: 7,
            last_message_at: '2026-05-17T10:00:00Z',
            phase_number: 6,
            state: 'active',
          },
        ],
      },
    ]);

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient: null,
      tenantId: 3,
      appointment: fakeAppointment({ contactId: 'ghl-contact-abc', customFields: [] }),
    });

    expect(result.method).toBe('ghl_contact_id');
    expect(result.confidence).toBe(95);
    expect(result.leadId).toBe(7);
    expect(result.conversationId).toBe(42);
  });

  it('prefiere fyzon_uuid del payload sobre ghl_contact_id (orden de estrategias)', async () => {
    const supabase = mockSupabase([
      // findLeadByTrackingUuid: encuentra lead 11 por UUID
      {
        table: 'leads',
        rows: [
          {
            id: 11,
            conversations: [
              { id: 99, last_message_at: '2026-05-17T10:00:00Z', phase_number: 6 },
            ],
          },
        ],
      },
      // conversations por ghl_contact_id también encontraría otro, pero NO debe usarlo
      {
        table: 'conversations',
        rows: [
          {
            id: 42,
            lead_id: 7,
            last_message_at: '2026-05-17T10:00:00Z',
            phase_number: 6,
            state: 'active',
          },
        ],
      },
    ]);

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient: null,
      tenantId: 3,
      appointment: fakeAppointment({
        contactId: 'ghl-contact-abc',
        customFields: [{ key: 'fyzon_lead_uuid', value: 'SLUG_UUID_REAL' }],
      }),
    });

    expect(result.method).toBe('fyzon_uuid');
    expect(result.confidence).toBe(100);
    expect(result.leadId).toBe(11);
    expect(result.conversationId).toBe(99);
  });

  it('cae a phone si ghl_contact_id no matchea ninguna conversation', async () => {
    const supabase = mockSupabase([
      // conversations por ghl_contact_id: 0 rows
      { table: 'conversations', rows: [] },
      // leads por phone: encuentra lead 9
      {
        table: 'leads',
        rows: [
          {
            id: 9,
            conversations: [
              { id: 50, last_message_at: '2026-05-17T10:00:00Z', phase_number: 4 },
            ],
          },
        ],
      },
    ]);

    const ghlClient = {
      getContactInfo: vi.fn().mockResolvedValue({
        id: 'ghl-contact-abc',
        phone: '+34666123456',
        customFields: [],
      }),
    } as unknown as Parameters<typeof matchLeadFromAppointment>[0]['ghlClient'];

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient,
      tenantId: 3,
      appointment: fakeAppointment({
        contactId: 'ghl-contact-abc',
        customFields: [],
      }),
    });

    expect(result.method).toBe('phone');
    expect(result.confidence).toBe(80);
    expect(result.leadId).toBe(9);
  });

  it('devuelve unmatched si no hay match en ninguna estrategia', async () => {
    const supabase = mockSupabase([
      { table: 'conversations', rows: [] },
      { table: 'leads', rows: [] },
    ]);

    const ghlClient = {
      getContactInfo: vi.fn().mockResolvedValue({
        id: 'ghl-contact-xyz',
        phone: '+34999000000', // no matchea ningún lead
        customFields: [],
      }),
    } as unknown as Parameters<typeof matchLeadFromAppointment>[0]['ghlClient'];

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient,
      tenantId: 3,
      appointment: fakeAppointment({ contactId: 'ghl-contact-xyz', customFields: [] }),
    });

    expect(result.method).toBe('unmatched');
    expect(result.leadId).toBe(null);
    expect(result.confidence).toBe(0);
  });

  it('si appointment.contactId es null/vacío, salta directo a getContactInfo / phone', async () => {
    const supabase = mockSupabase([
      // findLeadByPhone encuentra lead 5
      {
        table: 'leads',
        rows: [
          {
            id: 5,
            conversations: [
              { id: 30, last_message_at: '2026-05-17T10:00:00Z', phase_number: 3 },
            ],
          },
        ],
      },
    ]);

    const ghlClient = {
      getContactInfo: vi.fn().mockResolvedValue({
        id: 'will-not-be-used',
        phone: '+34666000111',
        customFields: [],
      }),
    } as unknown as Parameters<typeof matchLeadFromAppointment>[0]['ghlClient'];

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient,
      tenantId: 3,
      appointment: fakeAppointment({ contactId: '', customFields: [] }),
    });

    // Con contactId vacío: ni ghl_contact_id ni getContactInfo se invocan → unmatched.
    expect(result.method).toBe('unmatched');
    expect(ghlClient!.getContactInfo).not.toHaveBeenCalled();
  });

  it('prioriza conv activa sobre cerrada cuando hay varias con mismo ghl_contact_id', async () => {
    const supabase = mockSupabase([
      {
        table: 'conversations',
        rows: [
          // Conv vieja CERRADA, más reciente en timestamp
          {
            id: 100,
            lead_id: 50,
            last_message_at: '2026-05-17T12:00:00Z',
            phase_number: 7,
            state: 'closed',
          },
          // Conv ACTIVA, ligeramente más antigua
          {
            id: 200,
            lead_id: 60,
            last_message_at: '2026-05-17T11:50:00Z',
            phase_number: 5,
            state: 'active',
          },
        ],
      },
    ]);

    const result = await matchLeadFromAppointment({
      supabase,
      ghlClient: null,
      tenantId: 3,
      appointment: fakeAppointment({ contactId: 'ghl-contact-multi', customFields: [] }),
    });

    expect(result.method).toBe('ghl_contact_id');
    expect(result.conversationId).toBe(200); // la activa gana
    expect(result.leadId).toBe(60);
  });
});
