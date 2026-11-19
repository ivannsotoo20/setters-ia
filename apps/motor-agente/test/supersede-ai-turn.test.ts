import { describe, it, expect, vi } from 'vitest';
import {
  cancelSupersededAiTurn,
  isSupersedableTurn,
  SUPERSEDED_ERROR,
} from '../src/services/supersede-ai-turn.js';
import { clearDeferredDebounces, isDebouncePending } from '../src/lib/debounce-buffer.js';

// Turno caducado (2026-11-19). Ver services/supersede-ai-turn.ts.

function fakeSupabase(conv: Record<string, unknown> | null, pendingIds: number[] = []) {
  const updates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  return {
    updates,
    client: {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        let payload: Record<string, unknown> | null = null;
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return builder;
          },
          update: (p: Record<string, unknown>) => {
            payload = p;
            return builder;
          },
          maybeSingle: () =>
            Promise.resolve({ data: table === 'conversations' ? conv : null, error: null }),
          then: (resolve: (v: unknown) => unknown) => {
            if (table === 'message_schedules' && payload) {
              updates.push({ payload, filters });
              return Promise.resolve({ data: pendingIds.map((id) => ({ id })), error: null }).then(
                resolve,
              );
            }
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return builder;
      },
    } as any,
  };
}

const ACTIVE = { state: 'active', is_handoff_to_human: false, ai_paused_until: null };

describe('cancelSupersededAiTurn', () => {
  it('conversación activa: cancela las burbujas pendientes del turno de la IA', async () => {
    const { client, updates } = fakeSupabase(ACTIVE, [6955, 6956]);
    const out = await cancelSupersededAiTurn(client, 15317);
    expect(out).toEqual({ cancelled: 2 });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toEqual({ status: 'cancelled', last_error: SUPERSEDED_ERROR });
    expect(updates[0]!.filters).toEqual(
      expect.arrayContaining([
        ['conversation_id', 15317],
        ['triggered_by', 'ai_turn'],
        ['status', 'pending'],
      ]),
    );
  });

  it('nada pendiente: no pasa nada', async () => {
    const { client } = fakeSupabase(ACTIVE, []);
    expect(await cancelSupersededAiTurn(client, 1)).toEqual({
      cancelled: 0,
      skipped: 'nothing_pending',
    });
  });

  it.each([
    ['cerrada por zona (stopped): la despedida y el vídeo salen', { ...ACTIVE, state: 'stopped' }, 'not_active'],
    ['derivada (closed)', { ...ACTIVE, state: 'closed' }, 'not_active'],
    ['en manos de la entrenadora', { ...ACTIVE, is_handoff_to_human: true }, 'handoff'],
    ['IA pausada', { ...ACTIVE, ai_paused_until: 'infinity' }, 'ai_paused'],
  ])('%s: no cancela', async (_label, conv, skipped) => {
    const { client, updates } = fakeSupabase(conv, [1]);
    expect(await cancelSupersededAiTurn(client, 1)).toEqual({ cancelled: 0, skipped });
    expect(updates).toHaveLength(0);
  });

  it('nunca lanza', async () => {
    const client = {
      from: () => {
        throw new Error('supabase caído');
      },
    } as any;
    expect(await cancelSupersededAiTurn(client, 1)).toEqual({ cancelled: 0 });
  });
});

describe('isSupersedableTurn', () => {
  it('un turno normal de conversación se puede tirar', () => {
    expect(isSupersedableTurn({ conversation_status: 'active' })).toBe(true);
    expect(isSupersedableTurn({ conversation_status: 'qualified' })).toBe(true);
  });
  it('cierre, derivación, pausa o reserva de hueco no', () => {
    expect(isSupersedableTurn({ conversation_status: 'disqualified' })).toBe(false);
    expect(isSupersedableTurn({ conversation_status: 'handoff', handoff_cause: 'D_espera' })).toBe(
      false,
    );
    expect(isSupersedableTurn({ conversation_status: 'paused' })).toBe(false);
    expect(isSupersedableTurn({ conversation_status: 'active', handoff_cause: 'A_agenda' })).toBe(
      false,
    );
    expect(
      isSupersedableTurn({
        conversation_status: 'active',
        proposed_booking_slot: '2026-11-20T16:00:00Z',
      }),
    ).toBe(false);
  });
});

describe('isDebouncePending', () => {
  it('true si la conversación está en la cola, false si no, false si Redis falla', async () => {
    clearDeferredDebounces();
    const redis = { zscore: vi.fn() } as any;
    redis.zscore.mockResolvedValueOnce('1763560000000');
    expect(await isDebouncePending(redis, 1)).toBe(true);
    redis.zscore.mockResolvedValueOnce(null);
    expect(await isDebouncePending(redis, 1)).toBe(false);
    redis.zscore.mockRejectedValueOnce(new Error('down'));
    expect(await isDebouncePending(redis, 1)).toBe(false);
  });
});
