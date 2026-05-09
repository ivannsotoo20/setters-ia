import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueNotification, processNotificationQueue } from '../src/services/notify-trainer.js';

/**
 * Tests del servicio notify-trainer (Sprint Gamma 2.4):
 *   - enqueueNotification: INSERT pending row.
 *   - processNotificationQueue:
 *     * Skip si trainer sin email.
 *     * Skip si trainer no suscrito al event_type.
 *     * Send happy path → status='sent' + sent_at + resend_id.
 *     * Retry con backoff cuando sendEmail falla (newAttempts < MAX).
 *     * Failed cuando newAttempts >= MAX.
 *     * Default subscriptions = ['handoff', 'appointment_booked'].
 *     * Pick respeta next_attempt_at <= NOW.
 */

interface NotifRow {
  id: number;
  tenant_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
  last_error: string | null;
  resend_message_id: string | null;
}

interface PrefsRow {
  tenant_id: number;
  preferences: Record<string, unknown>;
}

interface TenantRow {
  id: number;
  name: string;
}

const state = {
  notifs: [] as NotifRow[],
  prefs: [] as PrefsRow[],
  tenants: [] as TenantRow[],
  nextId: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.notifs = [];
  state.prefs = [];
  state.tenants = [];
  state.nextId = 1;
  process.env.RESEND_API_KEY = 'test-key';
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend_test_id' }),
    text: async () => '',
  } as Response);
});

function makeMockSupabase() {
  return {
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

function makeBuilder(table: string) {
  const filters: Array<
    | { kind: 'eq'; col: string; val: unknown }
    | { kind: 'lte'; col: string; val: unknown }
  > = [];
  let limitN: number | null = null;

  const builder = {
    select: (_cols: string) => builder,
    eq(col: string, val: unknown) {
      filters.push({ kind: 'eq', col, val });
      return builder;
    },
    lte(col: string, val: unknown) {
      filters.push({ kind: 'lte', col, val });
      return builder;
    },
    order(_col: string, _opts?: { ascending?: boolean }) {
      return builder;
    },
    limit(n: number) {
      limitN = n;
      return builder;
    },
    maybeSingle: async <T,>(): Promise<{ data: T | null; error: null }> => {
      const rows = applyFilters(table, filters, limitN ?? 1);
      return { data: (rows[0] as T) ?? null, error: null };
    },
    then<T>(resolve: (v: { data: Array<Record<string, unknown>>; error: null }) => T) {
      const rows = applyFilters(table, filters, limitN);
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
    insert(payload: Record<string, unknown>) {
      const id = state.nextId++;
      const fullRec = { id, ...payload };
      if (table === 'notification_events') {
        state.notifs.push({
          id,
          tenant_id: payload.tenant_id as number,
          event_type: payload.event_type as string,
          payload: (payload.payload as Record<string, unknown>) ?? {},
          status: (payload.status as string) ?? 'pending',
          attempts: (payload.attempts as number) ?? 0,
          next_attempt_at:
            (payload.next_attempt_at as string) ?? new Date().toISOString(),
          sent_at: null,
          last_error: null,
          resend_message_id: null,
        });
      }
      return {
        select: (_cols: string) => ({
          maybeSingle: async () => ({ data: fullRec, error: null }),
        }),
      };
    },
    update(payload: Record<string, unknown>) {
      const updateFilters: Array<{ col: string; val: unknown }> = [];
      const chain = {
        eq(col: string, val: unknown) {
          updateFilters.push({ col, val });
          if (table === 'notification_events') {
            for (const n of state.notifs) {
              if (
                updateFilters.every(
                  (f) => (n as unknown as Record<string, unknown>)[f.col] === f.val,
                )
              ) {
                Object.assign(n, payload);
              }
            }
          }
          return chain;
        },
        then<T>(resolve: (v: { error: null }) => T) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return builder;
}

function applyFilters(
  table: string,
  filters: Array<{ kind: 'eq' | 'lte'; col: string; val: unknown }>,
  limit: number | null,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> =
    table === 'notification_events'
      ? (state.notifs as unknown as Array<Record<string, unknown>>)
      : table === 'trainer_preferences'
        ? (state.prefs as unknown as Array<Record<string, unknown>>)
        : table === 'tenants'
          ? (state.tenants as unknown as Array<Record<string, unknown>>)
          : [];
  let filtered = rows.filter((r) => {
    for (const f of filters) {
      if (f.kind === 'eq' && r[f.col] !== f.val) return false;
      if (f.kind === 'lte') {
        const a = String(r[f.col]);
        const b = String(f.val);
        if (a > b) return false;
      }
    }
    return true;
  });
  if (limit != null) filtered = filtered.slice(0, limit);
  return filtered;
}

const supabase = () => makeMockSupabase() as unknown as Parameters<typeof enqueueNotification>[0]['supabase'];

const NOW = new Date('2026-05-09T12:00:00.000Z');
const PAST = new Date('2026-05-09T11:00:00.000Z');

describe('enqueueNotification', () => {
  it('inserts pending row', async () => {
    const r = await enqueueNotification({
      supabase: supabase(),
      tenantId: 3,
      eventType: 'qualified',
      payload: { lead_id: 99 },
    });
    expect(r.ok).toBe(true);
    expect(state.notifs).toHaveLength(1);
    expect(state.notifs[0]!.event_type).toBe('qualified');
    expect(state.notifs[0]!.status).toBe('pending');
    expect(state.notifs[0]!.payload).toEqual({ lead_id: 99 });
  });
});

describe('processNotificationQueue — skips', () => {
  it('skips when trainer has no email', async () => {
    state.tenants.push({ id: 3, name: 'Test' });
    state.prefs.push({ tenant_id: 3, preferences: { trainerEmail: null } });
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'handoff',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(0);
    expect(state.notifs[0]!.status).toBe('skipped');
    expect(state.notifs[0]!.last_error).toMatch(/sin email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when trainer not subscribed to event_type', async () => {
    state.tenants.push({ id: 3, name: 'Test' });
    state.prefs.push({
      tenant_id: 3,
      preferences: {
        trainerEmail: 'trainer@x.com',
        notificationSubscriptions: ['handoff'], // NO suscrito a 'qualified'
      },
    });
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'qualified',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.skipped).toBe(1);
    expect(state.notifs[0]!.status).toBe('skipped');
    expect(state.notifs[0]!.last_error).toMatch(/no suscrito/);
  });

  it('default subscriptions = handoff + appointment_booked when not specified', async () => {
    state.tenants.push({ id: 3, name: 'Test' });
    // Sin notificationSubscriptions
    state.prefs.push({ tenant_id: 3, preferences: { trainerEmail: 'trainer@x.com' } });
    // qualified NO está en defaults
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'qualified',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });
    // handoff SÍ está en defaults
    state.notifs.push({
      id: 2,
      tenant_id: 3,
      event_type: 'handoff',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(1);
    expect(state.notifs.find((n) => n.event_type === 'qualified')!.status).toBe('skipped');
    expect(state.notifs.find((n) => n.event_type === 'handoff')!.status).toBe('sent');
  });
});

describe('processNotificationQueue — send happy path', () => {
  it('marks sent + saves resend_id when send succeeds', async () => {
    state.tenants.push({ id: 3, name: 'Iván / Fyzon' });
    state.prefs.push({
      tenant_id: 3,
      preferences: {
        trainerEmail: 'ivan@fyzon.es',
        notificationSubscriptions: ['qualified'],
      },
    });
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'qualified',
      payload: { lead_first_name: 'Ana', conversation_id: 99 },
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.sent).toBe(1);
    expect(state.notifs[0]!.status).toBe('sent');
    expect(state.notifs[0]!.resend_message_id).toBe('resend_test_id');
    expect(state.notifs[0]!.sent_at).toBeTruthy();
    expect(state.notifs[0]!.attempts).toBe(1);

    // Verifica que el body del email contiene el nombre del lead
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.to).toEqual(['ivan@fyzon.es']);
    expect(body.html).toContain('Ana');
  });
});

describe('processNotificationQueue — retry policy', () => {
  it('reschedules with backoff when send fails (attempts < MAX)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'down',
      json: async () => ({}),
    } as Response);

    state.tenants.push({ id: 3, name: 'Test' });
    state.prefs.push({
      tenant_id: 3,
      preferences: { trainerEmail: 'x@y.com', notificationSubscriptions: ['handoff'] },
    });
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'handoff',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.retried).toBe(1);
    expect(state.notifs[0]!.status).toBe('pending');
    expect(state.notifs[0]!.attempts).toBe(1);
    expect(state.notifs[0]!.last_error).toMatch(/503/);
    // next_attempt_at debe haber avanzado al futuro
    expect(new Date(state.notifs[0]!.next_attempt_at).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('marks failed when attempts reach MAX (3)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Down',
      text: async () => 'down',
      json: async () => ({}),
    } as Response);

    state.tenants.push({ id: 3, name: 'Test' });
    state.prefs.push({
      tenant_id: 3,
      preferences: { trainerEmail: 'x@y.com', notificationSubscriptions: ['handoff'] },
    });
    // Ya iba por attempts=2 (uno más → MAX=3)
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'handoff',
      payload: {},
      status: 'pending',
      attempts: 2,
      next_attempt_at: PAST.toISOString(),
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.failed).toBe(1);
    expect(state.notifs[0]!.status).toBe('failed');
    expect(state.notifs[0]!.attempts).toBe(3);
  });
});

describe('processNotificationQueue — pick filter', () => {
  it('does NOT pick rows with next_attempt_at in the future', async () => {
    state.tenants.push({ id: 3, name: 'Test' });
    state.prefs.push({ tenant_id: 3, preferences: { trainerEmail: 'x@y.com' } });
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    state.notifs.push({
      id: 1,
      tenant_id: 3,
      event_type: 'handoff',
      payload: {},
      status: 'pending',
      attempts: 0,
      next_attempt_at: future,
      sent_at: null,
      last_error: null,
      resend_message_id: null,
    });

    const r = await processNotificationQueue({
      supabase: supabase(),
      now: () => NOW,
      fetchImpl: fetchMock as unknown as typeof fetch,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(r.picked).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
