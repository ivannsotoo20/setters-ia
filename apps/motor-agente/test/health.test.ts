import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';

/**
 * 2026-10-20 — `/health` mira Redis. Del 17 al 20 de octubre devolvía
 * `ok: true` con Redis colgado y la IA muda, porque solo miraba Supabase.
 */

const mocks = vi.hoisted(() => ({
  redis: null as unknown,
  supabaseResult: { count: 2 as number | null, error: null as unknown },
}));

vi.mock('../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        is: () => ({
          abortSignal: () => Promise.resolve(mocks.supabaseResult),
        }),
      }),
    }),
  }),
}));

vi.mock('../src/lib/redis.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/redis.js')>();
  return { ...original, getRedis: () => mocks.redis };
});

const { healthRoutes } = await import('../src/routes/health.js');
const { DEBOUNCE_REDIS_KEY, clearDeferredDebounces, enqueueDebounceOrDefer } = await import(
  '../src/lib/debounce-buffer.js'
);

async function getHealth() {
  const app = Fastify({ logger: false });
  await app.register(healthRoutes);
  const startedAt = Date.now();
  const res = await app.inject({ method: 'GET', url: '/health' });
  return { res, body: res.json() as Record<string, unknown>, elapsedMs: Date.now() - startedAt };
}

beforeEach(async () => {
  const redis = new (RedisMock as unknown as new () => Redis)();
  await redis.del(DEBOUNCE_REDIS_KEY);
  mocks.redis = redis;
  mocks.supabaseResult = { count: 2, error: null };
  clearDeferredDebounces();
});

describe('GET /health', () => {
  it('todo sano: 200 con Redis alcanzable y el estado de la cola', async () => {
    const redis = mocks.redis as Redis;
    const now = Date.now();
    await redis.zadd(DEBOUNCE_REDIS_KEY, now + 25_000, '1');
    await redis.zadd(DEBOUNCE_REDIS_KEY, now - 10 * 60_000, '2'); // atascada

    const { res, body } = await getHealth();
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      supabase_reachable: true,
      prompt_blocks_count: 2,
      redis_reachable: true,
      redis_error: null,
      debounce_queue_size: 2,
      debounce_overdue: 1,
      debounce_deferred_in_memory: 0,
    });
    expect(typeof body.redis_latency_ms).toBe('number');
  });

  it('Redis caído: 503 con ok:false y el motivo', async () => {
    const down = {
      ping: () => Promise.reject(new Error('connect ECONNREFUSED 172.18.0.2:6379')),
      zadd: () => Promise.reject(new Error("Stream isn't writeable")),
    };
    mocks.redis = down;
    // Un webhook que llegó con Redis caído deja la conversación aplazada.
    await enqueueDebounceOrDefer(down as unknown as Redis, 13886, 25);

    const { res, body } = await getHealth();
    expect(res.statusCode).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      supabase_reachable: true,
      redis_reachable: false,
      redis_latency_ms: null,
      debounce_queue_size: null,
      debounce_overdue: null,
      debounce_deferred_in_memory: 1,
    });
    expect(String(body.redis_error)).toContain('ECONNREFUSED');
  });

  it('Redis colgado (no contesta): 503 en ~1 s, no se queda esperando', async () => {
    mocks.redis = { ping: () => new Promise(() => undefined) };

    const { res, body, elapsedMs } = await getHealth();
    expect(res.statusCode).toBe(503);
    expect(body.redis_reachable).toBe(false);
    expect(elapsedMs).toBeLessThan(2_500);
  });

  it('Supabase caído: 503 aunque Redis esté bien', async () => {
    mocks.supabaseResult = { count: null, error: { message: 'fetch failed' } };

    const { res, body } = await getHealth();
    expect(res.statusCode).toBe(503);
    expect(body).toMatchObject({ ok: false, supabase_reachable: false, redis_reachable: true });
  });
});
