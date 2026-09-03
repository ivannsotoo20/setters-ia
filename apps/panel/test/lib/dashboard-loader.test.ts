import { describe, it, expect } from 'vitest';
import {
  enrichWithLeadReplies,
  loadLastMessageBySource,
  loadTestLeadIds,
  resolveChannelFilter,
} from '../../lib/dashboard-loader';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

function conv(id: number, direction: 'inbound' | 'outbound'): ConvSnapshot {
  return {
    id,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction,
    last_message_at: null,
    created_at: '2026-09-01T00:00:00Z',
  };
}

/**
 * Supabase falso: registra cada lote de ids que se le pide y devuelve como
 * "mensajes de lead" los ids que el test declara respondidos.
 */
function makeSupabase(repliedIds: number[]): { batches: number[][]; client: any } {
  const batches: number[][] = [];
  const replied = new Set(repliedIds);
  const client = {
    from(table: string) {
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      let ids: number[] = [];
      const b: any = {
        select: () => b,
        in: (_col: string, values: number[]) => {
          ids = values;
          batches.push(values);
          return b;
        },
        eq: () =>
          Promise.resolve({
            data: ids.filter((id) => replied.has(id)).map((id) => ({ conversation_id: id })),
            error: null,
          }),
      };
      return b;
    },
  };
  return { batches, client };
}

describe('enrichWithLeadReplies', () => {
  it('marca solo las outbound, y solo las que tienen mensaje de la persona', async () => {
    const convs = [conv(1, 'outbound'), conv(2, 'outbound'), conv(3, 'inbound')];
    const sb = makeSupabase([2, 3]);
    const r = await enrichWithLeadReplies(sb.client, convs);
    expect(r.error).toBeNull();
    expect(convs[0]!.has_lead_reply).toBe(false);
    expect(convs[1]!.has_lead_reply).toBe(true);
    // La inbound no se consulta ni se marca: la pregunta "¿contestó?" no aplica.
    expect(convs[2]!.has_lead_reply).toBeUndefined();
    expect(sb.batches).toEqual([[1, 2]]);
  });

  it('trocea la consulta en lotes de 200 ids (límite de URL de PostgREST)', async () => {
    const convs = Array.from({ length: 450 }, (_, i) => conv(i + 1, 'outbound'));
    const sb = makeSupabase([1, 450]);
    await enrichWithLeadReplies(sb.client, convs);
    expect(sb.batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(convs[0]!.has_lead_reply).toBe(true);
    expect(convs[449]!.has_lead_reply).toBe(true);
    expect(convs[200]!.has_lead_reply).toBe(false);
  });

  it('sin outbound no consulta nada', async () => {
    const sb = makeSupabase([]);
    await enrichWithLeadReplies(sb.client, [conv(1, 'inbound')]);
    expect(sb.batches).toEqual([]);
  });
});

describe('resolveChannelFilter', () => {
  const channelMap = new Map<number, ChannelInfo>([
    [10, { kind: 'whatsapp' }],
    [20, { kind: 'instagram_dm' }],
    [30, { kind: 'facebook_messenger' }],
  ]);

  it('all → sin restricción', () => {
    expect(resolveChannelFilter('all', channelMap)).toEqual({ channelIds: null, direction: null });
  });

  it('ig-out es el canal de Instagram partido por dirección', () => {
    expect(resolveChannelFilter('ig-out', channelMap)).toEqual({
      channelIds: [20],
      direction: 'outbound',
    });
    expect(resolveChannelFilter('ig-in', channelMap)).toEqual({
      channelIds: [20],
      direction: 'inbound',
    });
  });

  it('wa y fb no imponen dirección', () => {
    expect(resolveChannelFilter('wa', channelMap)).toEqual({ channelIds: [10], direction: null });
    expect(resolveChannelFilter('fb', channelMap)).toEqual({ channelIds: [30], direction: null });
  });
});

interface MsgRow {
  id: number;
  conversation_id: number;
  source: string;
  sent_at: string;
}

/**
 * Supabase falso para `conversation_messages`: filtra por ids, ordena y pagina
 * con range() como PostgREST (con su tope de filas por respuesta), y registra
 * cada petición (lote de ids + offset).
 */
function makeMessagesSupabase(rows: MsgRow[], serverMaxRows = 1000) {
  const requests: Array<{ ids: number[]; from: number; to: number }> = [];
  const client: any = {
    from(table: string) {
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      let ids: number[] = [];
      const orders: Array<{ col: keyof MsgRow; asc: boolean }> = [];
      const b: any = {
        select: () => b,
        in: (_col: string, values: number[]) => {
          ids = values;
          return b;
        },
        order: (col: keyof MsgRow, opts?: { ascending?: boolean }) => {
          orders.push({ col, asc: opts?.ascending ?? true });
          return b;
        },
        range: (from: number, to: number) => {
          requests.push({ ids, from, to });
          const idSet = new Set(ids);
          const filtered = rows
            .filter((r) => idSet.has(r.conversation_id))
            .sort((x, y) => {
              for (const o of orders) {
                if (x[o.col] < y[o.col]) return o.asc ? -1 : 1;
                if (x[o.col] > y[o.col]) return o.asc ? 1 : -1;
              }
              return 0;
            });
          const page = filtered.slice(from, Math.min(to + 1, from + serverMaxRows));
          return Promise.resolve({ data: page, error: null });
        },
      };
      return b;
    },
  };
  return { requests, client };
}

describe('loadLastMessageBySource', () => {
  it('devuelve quién escribió el último mensaje, cuándo, y el último de la entrenadora', async () => {
    const rows: MsgRow[] = [
      // conv 1: la persona escribió la última, la entrenadora nunca
      { id: 3, conversation_id: 1, source: 'lead', sent_at: '2026-09-01T10:00:00Z' },
      { id: 1, conversation_id: 1, source: 'ai', sent_at: '2026-09-01T08:00:00Z' },
      { id: 2, conversation_id: 1, source: 'lead', sent_at: '2026-09-01T09:00:00Z' },
      // conv 2: la entrenadora escribió y la persona contestó después
      { id: 4, conversation_id: 2, source: 'ai', sent_at: '2026-09-02T08:00:00Z' },
      { id: 5, conversation_id: 2, source: 'human', sent_at: '2026-09-02T09:00:00Z' },
      { id: 6, conversation_id: 2, source: 'lead', sent_at: '2026-09-02T10:00:00Z' },
      // conv 3: solo la IA
      { id: 7, conversation_id: 3, source: 'ai', sent_at: '2026-09-02T11:00:00Z' },
      // conv 9 no se pide: no debe colarse
      { id: 8, conversation_id: 9, source: 'lead', sent_at: '2026-09-02T12:00:00Z' },
    ];
    const sb = makeMessagesSupabase(rows);
    const r = await loadLastMessageBySource(sb.client, [1, 2, 3, 4]);
    expect(r.error).toBeNull();
    expect(r.lastMessages.get(1)).toEqual({
      source: 'lead',
      sentAt: '2026-09-01T10:00:00Z',
      lastHumanAt: null,
    });
    expect(r.lastMessages.get(2)).toEqual({
      source: 'lead',
      sentAt: '2026-09-02T10:00:00Z',
      lastHumanAt: '2026-09-02T09:00:00Z',
    });
    expect(r.lastMessages.get(3)).toEqual({
      source: 'ai',
      sentAt: '2026-09-02T11:00:00Z',
      lastHumanAt: null,
    });
    // Sin mensajes → no aparece
    expect(r.lastMessages.has(4)).toBe(false);
    expect(r.lastMessages.has(9)).toBe(false);
    expect(sb.requests).toHaveLength(1);
  });

  it('trocea en lotes de 200 conversaciones (límite de URL de PostgREST)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const rows: MsgRow[] = ids.map((id) => ({
      id,
      conversation_id: id,
      source: 'ai',
      sent_at: '2026-09-01T08:00:00Z',
    }));
    const sb = makeMessagesSupabase(rows);
    const r = await loadLastMessageBySource(sb.client, ids);
    expect(sb.requests.map((q) => q.ids.length)).toEqual([200, 200, 50]);
    expect(r.lastMessages.size).toBe(450);
  });

  it('pagina de 1000 en 1000 dentro de un lote: Supabase corta cada respuesta en 1000 filas', async () => {
    const total = 2500;
    const rows: MsgRow[] = Array.from({ length: total }, (_, i) => ({
      id: i + 1,
      conversation_id: 1,
      source: i === total - 1 ? 'human' : i % 2 ? 'ai' : 'lead',
      sent_at: new Date(Date.UTC(2026, 7, 1) + i * 60000).toISOString(),
    }));
    const sb = makeMessagesSupabase(rows);
    const r = await loadLastMessageBySource(sb.client, [1]);
    expect(sb.requests.map((q) => q.from)).toEqual([0, 1000, 2000]);
    const lastSentAt = rows[total - 1]!.sent_at;
    expect(r.lastMessages.get(1)).toEqual({
      source: 'human',
      sentAt: lastSentAt,
      lastHumanAt: lastSentAt,
    });
  });

  it('sin ids no consulta nada', async () => {
    const sb = makeMessagesSupabase([]);
    const r = await loadLastMessageBySource(sb.client, []);
    expect(sb.requests).toEqual([]);
    expect(r.lastMessages.size).toBe(0);
  });
});

describe('loadTestLeadIds', () => {
  function makeLeadsSupabase(rows: Array<{ id: number; first_name: string | null }>) {
    const filters: string[] = [];
    const client: any = {
      from(table: string) {
        if (table !== 'leads') throw new Error(`tabla inesperada ${table}`);
        const b: any = {
          select: () => b,
          eq: () => b,
          or: (expr: string) => {
            filters.push(expr);
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return b;
      },
    };
    return { filters, client };
  }

  it('devuelve los ids de los leads de Iván y repasa el nombre en JS', async () => {
    const sb = makeLeadsSupabase([
      { id: 1, first_name: 'Iván' },
      { id: 2, first_name: 'Ivana' },
      { id: 3, first_name: 'ivan' },
      { id: 4, first_name: null },
    ]);
    const r = await loadTestLeadIds(sb.client, 7);
    expect(r.error).toBeNull();
    expect(Array.from(r.testLeadIds).sort()).toEqual([1, 3]);
    expect(sb.filters[0]).toContain('first_name.ilike.ivan');
  });
});
