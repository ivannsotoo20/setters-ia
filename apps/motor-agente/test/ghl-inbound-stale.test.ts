import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis } from 'ioredis';
import type { GhlParsedInbound } from '@fyzon/channel-adapters';
import {
  GHL_STALE_INBOUND_MS,
  ghlMessageSentAt,
  routeGhlInbound,
} from '../src/services/ghl-message-router.js';

/**
 * 2026-10-20 — fecha de los mensajes de GHL y reintentos tardíos.
 *
 * Incidente 17-20 oct: GHL reintentó durante días un webhook fallido con el
 * mismo messageId (a +22 h 53 m y después cada 24 h). Se guardaba con la hora
 * de la entrega (`timestamp`): un mensaje escrito el 17 entraba el 20 como
 * nuevo y despertaba a la IA con la ventana de 24 h de Instagram ya cerrada.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

interface Call {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  payload?: unknown;
}

let calls: Call[] = [];
const zadd = vi.fn(() => Promise.resolve(1));
const redis = { zadd } as unknown as Redis;

/** Respuestas de las tablas que toca `routeGhlInbound` para un lead que ya existe. */
function respond(call: Call): { data: unknown; error: null } {
  const ok = (data: unknown) => ({ data, error: null });
  switch (call.table) {
    case 'channels':
      return ok({ id: 3 });
    case 'leads':
      return ok(call.op === 'select' ? { id: 11, timezone: 'Europe/Madrid' } : null);
    case 'conversations':
      return ok(
        call.op === 'select'
          ? { id: 13886, ai_paused_until: null, ghl_contact_id: 'contact_1', ghl_conversation_id: 'gc1' }
          : null,
      );
    case 'tenant_configs':
      return ok({ ghl_inbound_mode: 'all' });
    case 'conversation_messages':
      return ok(call.op === 'upsert' ? [{ id: 950 }] : null);
    default:
      return ok(null);
  }
}

/** Query builder encadenable y "thenable": apunta la llamada y resuelve con `respond`. */
function makeSupabaseStub(): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, op: 'select' };
      let opSet = false;
      const b: Record<string, unknown> = {};
      const setOp = (op: Call['op'], payload?: unknown) => {
        if (!opSet) {
          call.op = op;
          call.payload = payload;
          opSet = true;
        }
        return b;
      };
      b.select = () => {
        opSet = true;
        return b;
      };
      b.insert = (p: unknown) => setOp('insert', p);
      b.upsert = (p: unknown) => setOp('upsert', p);
      b.update = (p: unknown) => setOp('update', p);
      b.delete = () => setOp('delete');
      for (const m of ['eq', 'neq', 'is', 'not', 'in', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'maybeSingle', 'single']) {
        b[m] = () => b;
      }
      b.then = (resolve: (v: unknown) => void) => {
        calls.push(call);
        resolve(respond(call));
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

function inboundAt(dates: { dateAdded: string | null; timestamp: string | null }): GhlParsedInbound {
  return {
    tenantId: 7,
    ghlLocationId: 'loc_7',
    ghlContactId: 'contact_1',
    ghlConversationId: 'gc1',
    channel: 'instagram',
    message: 'Me interesa, ¿cómo funciona?',
    attachments: [],
    ghlMessageId: 'ghl_msg_1',
    ...dates,
  };
}

/** Escrito hace `ageMs` y entregado ahora, como un reintento de GHL. */
function retriedAfter(ageMs: number): GhlParsedInbound {
  const now = Date.now();
  return inboundAt({
    dateAdded: new Date(now - ageMs).toISOString(),
    timestamp: new Date(now).toISOString(),
  });
}

function route(inbound: GhlParsedInbound) {
  return routeGhlInbound({
    supabase: makeSupabaseStub(),
    redis,
    ghlClient: null,
    inbound,
    debounceWindowSeconds: 25,
  });
}

function savedSentAt(): unknown[] {
  const write = calls.find((c) => c.table === 'conversation_messages' && c.op === 'upsert');
  return ((write?.payload ?? []) as Array<Record<string, unknown>>).map((r) => r.sent_at);
}

beforeEach(() => {
  calls = [];
  zadd.mockClear();
});

describe('ghlMessageSentAt', () => {
  const now = Date.parse('2026-10-20T18:03:41.000Z');

  it('prefiere dateAdded a timestamp', () => {
    expect(
      ghlMessageSentAt({ dateAdded: '2026-10-17T19:09:12.000Z', timestamp: '2026-10-20T18:03:41.000Z' }, now),
    ).toBe('2026-10-17T19:09:12.000Z');
  });

  it('sin dateAdded legible tira de timestamp', () => {
    for (const dateAdded of [null, '', 'no es una fecha']) {
      expect(ghlMessageSentAt({ dateAdded, timestamp: '2026-10-20T18:03:30.000Z' }, now)).toBe(
        '2026-10-20T18:03:30.000Z',
      );
    }
  });

  it('sin ninguna de las dos, la hora actual', () => {
    expect(ghlMessageSentAt({ dateAdded: null, timestamp: null }, now)).toBe('2026-10-20T18:03:41.000Z');
  });

  it('una fecha futura se recorta a ahora', () => {
    expect(ghlMessageSentAt({ dateAdded: '2026-10-21T09:00:00.000Z', timestamp: null }, now)).toBe(
      '2026-10-20T18:03:41.000Z',
    );
  });
});

describe('routeGhlInbound — mensajes que llegan por un reintento de GHL', () => {
  it('un mensaje recién escrito se guarda con su dateAdded y encola el debounce', async () => {
    const inbound = retriedAfter(3_000);
    const result = await route(inbound);

    expect(result).toMatchObject({ messageId: 950, duplicate: false, stale: false });
    expect(savedSentAt()).toEqual([inbound.dateAdded]);
    expect(zadd).toHaveBeenCalledTimes(1);
  });

  it('el reintento de +22 h 53 m todavía se contesta', async () => {
    const result = await route(retriedAfter(22 * HOUR + 53 * MIN));

    expect(result.stale).toBe(false);
    expect(zadd).toHaveBeenCalledTimes(1);
  });

  it('el reintento de 3 días después se guarda con su fecha, sin encolar el debounce', async () => {
    const inbound = retriedAfter(70 * HOUR + 53 * MIN);
    const result = await route(inbound);

    expect(result).toMatchObject({ messageId: 950, duplicate: false, stale: true });
    expect(savedSentAt()).toEqual([inbound.dateAdded]);
    expect(zadd).not.toHaveBeenCalled();
  });

  it('el corte está en GHL_STALE_INBOUND_MS', async () => {
    expect((await route(retriedAfter(GHL_STALE_INBOUND_MS - MIN))).stale).toBe(false);
    expect(zadd).toHaveBeenCalledTimes(1);

    zadd.mockClear();
    expect((await route(retriedAfter(GHL_STALE_INBOUND_MS + MIN))).stale).toBe(true);
    expect(zadd).not.toHaveBeenCalled();
  });

  it('sin dateAdded se fecha con timestamp, como hasta ahora, y se encola', async () => {
    const timestamp = new Date(Date.now() - 5_000).toISOString();
    const result = await route(inboundAt({ dateAdded: null, timestamp }));

    expect(result.stale).toBe(false);
    expect(savedSentAt()).toEqual([timestamp]);
    expect(zadd).toHaveBeenCalledTimes(1);
  });
});
