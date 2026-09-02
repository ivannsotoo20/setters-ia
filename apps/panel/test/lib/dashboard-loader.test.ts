import { describe, it, expect } from 'vitest';
import { enrichWithLeadReplies, resolveChannelFilter } from '../../lib/dashboard-loader';
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
