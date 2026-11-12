import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import {
  clearAllDebounces,
  clearDebounceFailures,
  DEBOUNCE_RETRY_DELAYS_S,
  getExpiredDebounces,
  peekNextDebounce,
  registerDebounceFailure,
} from '../src/lib/debounce-buffer.js';
import { handleDebounceFailure } from '../src/services/debounce-failure.js';

/**
 * 2026-11-12 — La conversación 15128 (tenant 7) se reencoló cada 30 s durante
 * tres días: ~5.200 llamadas pagadas. Estos tests fijan el tope.
 */

const makeRedis = () => new (RedisMock as unknown as new () => import('ioredis').Redis)();

function makeSupabase(notifications: any[], tenantId: number | null = 7) {
  return {
    from(table: string) {
      if (table === 'conversations') {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: () =>
            Promise.resolve({ data: tenantId == null ? null : { tenant_id: tenantId }, error: null }),
        };
        return b;
      }
      if (table === 'notification_events') {
        const b: any = {
          insert: (row: any) => {
            notifications.push(row);
            return b;
          },
          select: () => b,
          maybeSingle: () => Promise.resolve({ data: { id: notifications.length }, error: null }),
        };
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

const log = { error: vi.fn(), warn: vi.fn() };

describe('registerDebounceFailure', () => {
  let redis: import('ioredis').Redis;
  beforeEach(async () => {
    redis = makeRedis();
    await clearAllDebounces(redis);
    await clearDebounceFailures(redis, 15128);
  });

  it('cada fallo espera más que el anterior y el sexto ya no se reintenta', async () => {
    const delays: Array<number | null> = [];
    for (let i = 0; i < DEBOUNCE_RETRY_DELAYS_S.length + 1; i++) {
      delays.push((await registerDebounceFailure(redis, 15128)).retryDelayS);
    }
    expect(delays).toEqual([30, 120, 600, 1_800, 3_600, null]);
  });

  it('agotados los intentos el contador se borra: un mensaje nuevo empieza de cero', async () => {
    for (let i = 0; i < DEBOUNCE_RETRY_DELAYS_S.length + 1; i++) {
      await registerDebounceFailure(redis, 15128);
    }
    expect((await registerDebounceFailure(redis, 15128)).attempt).toBe(1);
  });

  it('un turno que sale bien borra los fallos anteriores', async () => {
    await registerDebounceFailure(redis, 15128);
    await registerDebounceFailure(redis, 15128);
    await clearDebounceFailures(redis, 15128);
    expect((await registerDebounceFailure(redis, 15128)).attempt).toBe(1);
  });

  it('los contadores son por conversación', async () => {
    await registerDebounceFailure(redis, 1);
    await registerDebounceFailure(redis, 1);
    expect((await registerDebounceFailure(redis, 2)).attempt).toBe(1);
  });
});

describe('handleDebounceFailure', () => {
  let redis: import('ioredis').Redis;
  beforeEach(async () => {
    redis = makeRedis();
    await clearAllDebounces(redis);
    await clearDebounceFailures(redis, 15128);
    log.error.mockClear();
    log.warn.mockClear();
  });

  it('un fallo reencola con la espera que toca', async () => {
    const notifications: any[] = [];
    const before = Date.now();
    const out = await handleDebounceFailure(
      { redis, supabase: makeSupabase(notifications), log },
      15128,
      new Error('boom'),
    );
    expect(out).toEqual({ action: 'requeued', attempt: 1, retryDelayS: 30 });
    const next = await peekNextDebounce(redis);
    expect(next?.conversationId).toBe(15128);
    expect(next!.expiresAtMs).toBeGreaterThanOrEqual(before + 30_000);
    expect(notifications).toHaveLength(0);
  });

  it('un fallo que se repite deja de reencolarse y avisa a los admins una sola vez', async () => {
    const notifications: any[] = [];
    const deps = { redis, supabase: makeSupabase(notifications), log };
    const outcomes = [];
    for (let i = 0; i < DEBOUNCE_RETRY_DELAYS_S.length + 1; i++) {
      // El cron reclama (ZREM) la entrada antes de procesarla.
      await clearAllDebounces(redis);
      outcomes.push((await handleDebounceFailure(deps, 15128, new Error('vacío sin handoff'))).action);
    }
    expect(outcomes).toEqual(['requeued', 'requeued', 'requeued', 'requeued', 'requeued', 'abandoned']);
    // Abandonada: ya no está en la cola.
    expect(await peekNextDebounce(redis)).toBeNull();
    expect(await getExpiredDebounces(redis, Date.now() + 10 * 3_600_000)).toEqual([]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      tenant_id: 7,
      event_type: 'error_motor',
      status: 'pending',
      payload: { kind: 'ai_turn_abandoned', conversation_id: 15128, attempts: 6 },
    });
    expect(notifications[0].payload.error).toMatch(/vacío sin handoff/);
  });

  it('si no encuentra el tenant no avisa, pero tampoco reencola', async () => {
    const notifications: any[] = [];
    const deps = { redis, supabase: makeSupabase(notifications, null), log };
    let last;
    for (let i = 0; i < DEBOUNCE_RETRY_DELAYS_S.length + 1; i++) {
      await clearAllDebounces(redis);
      last = await handleDebounceFailure(deps, 15128, new Error('x'));
    }
    expect(last?.action).toBe('abandoned');
    expect(notifications).toHaveLength(0);
    expect(await peekNextDebounce(redis)).toBeNull();
  });
});
