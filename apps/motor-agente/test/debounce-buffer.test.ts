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
