import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import {
  clearAllDebounces,
  dropDebounce,
  enqueueDebounce,
  getExpiredDebounces,
  pendingDebouncesCount,
  peekNextDebounce,
} from '../src/lib/debounce-buffer.js';

// ioredis-mock implementa la API ioredis con Map en memoria
const makeRedis = () => new (RedisMock as unknown as new () => import('ioredis').Redis)();

describe('debounce-buffer', () => {
  let redis: import('ioredis').Redis;

  beforeEach(async () => {
    redis = makeRedis();
    await clearAllDebounces(redis);
  });

  it('enqueues a new conversation with future expiry', async () => {
    const before = Date.now();
    const entry = await enqueueDebounce(redis, 7, 25);
    expect(entry.conversationId).toBe(7);
    expect(entry.expiresAtMs).toBeGreaterThanOrEqual(before + 25_000);
    expect(await pendingDebouncesCount(redis)).toBe(1);
  });

  it('extends an existing conversation (overwrites score, not appends)', async () => {
    await enqueueDebounce(redis, 7, 25);
    await new Promise((r) => setTimeout(r, 10));
    const second = await enqueueDebounce(redis, 7, 60);
    expect(await pendingDebouncesCount(redis)).toBe(1);
    const peek = await peekNextDebounce(redis);
    expect(peek?.expiresAtMs).toBe(second.expiresAtMs);
  });

  it('getExpiredDebounces returns nothing when no entry has expired', async () => {
    await enqueueDebounce(redis, 7, 25);
    const expired = await getExpiredDebounces(redis, Date.now());
    expect(expired).toHaveLength(0);
  });

  it('getExpiredDebounces returns conversations whose expiry passed', async () => {
    // Enqueue with 0 seconds → vence inmediatamente
    await enqueueDebounce(redis, 7, 0);
    await enqueueDebounce(redis, 9, 0);
    await new Promise((r) => setTimeout(r, 5));
    const expired = await getExpiredDebounces(redis, Date.now());
    expect(expired.map((e) => e.conversationId).sort()).toEqual([7, 9]);
  });

  it('dropDebounce removes only the targeted conversation', async () => {
    await enqueueDebounce(redis, 7, 0);
    await enqueueDebounce(redis, 9, 0);
    await dropDebounce(redis, 7);
    expect(await pendingDebouncesCount(redis)).toBe(1);
    const peek = await peekNextDebounce(redis);
    expect(peek?.conversationId).toBe(9);
  });

  it('dropDebounce on missing conversation is idempotent', async () => {
    await dropDebounce(redis, 999);
    expect(await pendingDebouncesCount(redis)).toBe(0);
  });

  // El retorno de dropDebounce es el CLAIM que impide que dos ticks solapados
  // procesen la misma conversacion. Si alguien vuelve a tiparlo como void, estos
  // dos tests caen y la persona deja de recibir dos respuestas al mismo mensaje.
  it('dropDebounce devuelve true solo para quien se queda la entrada', async () => {
    await enqueueDebounce(redis, 7, 0);
    expect(await dropDebounce(redis, 7)).toBe(true);
    expect(await dropDebounce(redis, 7)).toBe(false);
  });

  it('dropDebounce devuelve false si la entrada nunca existio', async () => {
    expect(await dropDebounce(redis, 999)).toBe(false);
  });

  it('entre dos ticks concurrentes sobre la misma entrada, solo uno gana', async () => {
    await enqueueDebounce(redis, 42, 0);
    // Lo que pasa de verdad: el tick A tiene [42] en su snapshot y aun no ha
    // llegado a ella; el tick B, 5s despues, ve 42 todavia viva y la reclama.
    const [a, b] = await Promise.all([dropDebounce(redis, 42), dropDebounce(redis, 42)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await pendingDebouncesCount(redis)).toBe(0);
  });

  it('clearAllDebounces empties the set', async () => {
    await enqueueDebounce(redis, 1, 0);
    await enqueueDebounce(redis, 2, 0);
    await clearAllDebounces(redis);
    expect(await pendingDebouncesCount(redis)).toBe(0);
  });

  it('respects the limit param of getExpiredDebounces', async () => {
    for (let i = 1; i <= 5; i++) await enqueueDebounce(redis, i, 0);
    await new Promise((r) => setTimeout(r, 5));
    const expired = await getExpiredDebounces(redis, Date.now(), 3);
    expect(expired).toHaveLength(3);
  });
});
