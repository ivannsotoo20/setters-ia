import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  REDIS_COMMAND_TIMEOUT_MS,
  buildRedisOptions,
  createRedisClient,
  createThrottledLog,
  pingRedis,
  tryClaimDedupKey,
  waitForRedisReady,
} from '../src/lib/redis.js';
import {
  DEBOUNCE_REDIS_KEY,
  clearDeferredDebounces,
  deferredDebouncesCount,
  enqueueDebounceOrDefer,
  flushDeferredDebounces,
  getExpiredDebounces,
  overdueDebouncesCount,
} from '../src/lib/debounce-buffer.js';

/**
 * 2026-10-20 — incidente del 17-oct: Redis dejó de contestar con la conexión
 * abierta y el motor se quedó esperando para siempre (sin `commandTimeout`).
 * Estos tests reproducen los dos fallos con sockets reales contra un servidor
 * falso: Redis colgado (acepta y no contesta) y Redis caído (nadie escucha).
 */

// ---------------------------------------------------------------------------
// Servidor RESP mínimo: contesta el handshake de ioredis y, con `freeze()`,
// sigue leyendo pero deja de responder, como el Redis del 17-oct.
// ---------------------------------------------------------------------------

interface FakeRedis {
  url: string;
  freeze: () => void;
  close: () => Promise<void>;
}

function parseCommand(buf: Buffer): { args: string[]; consumed: number } | null {
  let offset = 0;
  const readLine = (): string | null => {
    const idx = buf.indexOf('\r\n', offset);
    if (idx === -1) return null;
    const line = buf.toString('utf8', offset, idx);
    offset = idx + 2;
    return line;
  };
  const head = readLine();
  if (head == null) return null;
  const count = Number(head.slice(1));
  const args: string[] = [];
  for (let i = 0; i < count; i++) {
    const lenLine = readLine();
    if (lenLine == null) return null;
    const len = Number(lenLine.slice(1));
    if (buf.length < offset + len + 2) return null;
    args.push(buf.toString('utf8', offset, offset + len));
    offset += len + 2;
  }
  return { args, consumed: offset };
}

function replyFor(args: string[]): string {
  const cmd = (args[0] ?? '').toUpperCase();
  if (cmd === 'INFO') {
    const body = '# Server\r\nredis_version:7.2.4\r\nloading:0\r\n';
    return `$${Buffer.byteLength(body)}\r\n${body}\r\n`;
  }
  if (cmd === 'PING') return '+PONG\r\n';
  if (cmd === 'ZADD' || cmd === 'ZCARD' || cmd === 'ZCOUNT') return ':1\r\n';
  return '+OK\r\n';
}

async function startFakeRedis(): Promise<FakeRedis> {
  let frozen = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const parsed = parseCommand(buf);
        if (!parsed) break;
        buf = buf.subarray(parsed.consumed);
        if (frozen) continue;
        socket.write(replyFor(parsed.args));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `redis://127.0.0.1:${port}`,
    freeze: () => {
      frozen = true;
    },
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Un puerto donde no escucha nadie: Redis caído o contenedor parado. */
async function deadPortUrl(): Promise<string> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `redis://127.0.0.1:${port}`;
}

describe('opciones del cliente Redis', () => {
  it('fija commandTimeout de 2 s y desactiva la cola offline', () => {
    const opts = buildRedisOptions();
    expect(REDIS_COMMAND_TIMEOUT_MS).toBe(2_000);
    expect(opts.commandTimeout).toBe(2_000);
    expect(opts.enableOfflineQueue).toBe(false);
    expect(opts.maxRetriesPerRequest).toBe(1);
  });
});

describe('Redis colgado (acepta la conexión y no contesta)', () => {
  let fake: FakeRedis;
  let client: Redis;

  beforeEach(async () => {
    fake = await startFakeRedis();
    // Timeout corto para no alargar la suite; el mecanismo es el mismo.
    client = createRedisClient(fake.url, { commandTimeout: 200 });
    await expect(waitForRedisReady(client, 2_000)).resolves.toBe(true);
    await client.ping();
  });

  afterEach(async () => {
    client.disconnect();
    await fake.close();
  });

  it('el comando falla por timeout en vez de esperar para siempre', async () => {
    fake.freeze();
    const startedAt = Date.now();
    await expect(client.set('k', '1')).rejects.toThrow(/timed out/i);
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it('el antiduplicado deja pasar el mensaje (fail-open) en cuanto vence el timeout', async () => {
    fake.freeze();
    const startedAt = Date.now();
    await expect(tryClaimDedupKey('ycloud:7:wamid.X', 60, client)).resolves.toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it('pingRedis informa de que Redis no responde dentro de su propio timeout', async () => {
    fake.freeze();
    const res = await pingRedis(client, 100);
    expect(res.reachable).toBe(false);
    expect(res.latencyMs).toBeNull();
  });

  it('pingRedis con Redis sano devuelve la latencia', async () => {
    const res = await pingRedis(client, 1_000);
    expect(res.reachable).toBe(true);
    expect(res.latencyMs).not.toBeNull();
  });
});

describe('Redis caído (nadie escucha en el puerto)', () => {
  let client: Redis;

  beforeEach(async () => {
    client = createRedisClient(await deadPortUrl());
  });

  afterEach(() => {
    client.disconnect();
  });

  it('waitForRedisReady no bloquea el arranque más allá de su límite', async () => {
    const startedAt = Date.now();
    await expect(waitForRedisReady(client, 150)).resolves.toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('el comando falla en milisegundos, sin esperar al timeout', async () => {
    const startedAt = Date.now();
    await expect(client.set('k', '1')).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(REDIS_COMMAND_TIMEOUT_MS / 4);
  });

  it('el antiduplicado deja pasar el mensaje al instante', async () => {
    const startedAt = Date.now();
    await expect(tryClaimDedupKey('ghl_oauth:7:msg1', 60, client)).resolves.toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(REDIS_COMMAND_TIMEOUT_MS / 4);
  });

  it('el encolado del debounce se aplaza en memoria en vez de perderse', async () => {
    clearDeferredDebounces();
    const res = await enqueueDebounceOrDefer(client, 13886, 25);
    expect(res.deferred).toBe(true);
    expect(deferredDebouncesCount()).toBe(1);
    clearDeferredDebounces();
  });
});

describe('debounce aplazado: vuelve a la cola cuando Redis responde', () => {
  const makeMock = () => new (RedisMock as unknown as new () => Redis)();
  const failing = {
    zadd: () => Promise.reject(new Error('Command timed out')),
  } as unknown as Redis;

  beforeEach(() => {
    clearDeferredDebounces();
  });

  it('con Redis sano encola directamente y no aplaza nada', async () => {
    const redis = makeMock();
    await redis.del(DEBOUNCE_REDIS_KEY);
    const res = await enqueueDebounceOrDefer(redis, 7, 25);
    expect(res.deferred).toBe(false);
    expect(deferredDebouncesCount()).toBe(0);
    expect(await redis.zscore(DEBOUNCE_REDIS_KEY, '7')).toBe(String(res.entry.expiresAtMs));
  });

  it('flushDeferredDebounces mete lo aplazado con su vencimiento original', async () => {
    const res = await enqueueDebounceOrDefer(failing, 13750, 0);
    expect(res.deferred).toBe(true);

    const redis = makeMock();
    await redis.del(DEBOUNCE_REDIS_KEY);
    const out = await flushDeferredDebounces(redis);
    expect(out).toEqual({ flushed: 1, pending: 0 });
    expect(deferredDebouncesCount()).toBe(0);

    const expired = await getExpiredDebounces(redis, Date.now() + 1);
    expect(expired.map((e) => e.conversationId)).toEqual([13750]);
    expect(expired[0]!.expiresAtMs).toBe(res.entry.expiresAtMs);
  });

  it('no pisa una entrada más reciente que ya esté en Redis (NX)', async () => {
    await enqueueDebounceOrDefer(failing, 9, 0);
    const redis = makeMock();
    await redis.del(DEBOUNCE_REDIS_KEY);
    const later = Date.now() + 60_000;
    await redis.zadd(DEBOUNCE_REDIS_KEY, later, '9');

    await flushDeferredDebounces(redis);
    expect(await redis.zscore(DEBOUNCE_REDIS_KEY, '9')).toBe(String(later));
    expect(deferredDebouncesCount()).toBe(0);
  });

  it('si Redis sigue caído no pierde nada y lo reintenta en el siguiente tick', async () => {
    await enqueueDebounceOrDefer(failing, 1, 25);
    await enqueueDebounceOrDefer(failing, 2, 25);
    const out = await flushDeferredDebounces(failing);
    expect(out).toEqual({ flushed: 0, pending: 2 });
  });

  it('varios mensajes de la misma conversación dejan una entrada con el vencimiento más tardío', async () => {
    const first = await enqueueDebounceOrDefer(failing, 5, 0);
    const second = await enqueueDebounceOrDefer(failing, 5, 25);
    expect(deferredDebouncesCount()).toBe(1);

    const redis = makeMock();
    await redis.del(DEBOUNCE_REDIS_KEY);
    await flushDeferredDebounces(redis);
    const score = Number(await redis.zscore(DEBOUNCE_REDIS_KEY, '5'));
    expect(score).toBe(second.entry.expiresAtMs);
    expect(score).toBeGreaterThan(first.entry.expiresAtMs);
  });

  it('overdueDebouncesCount cuenta solo lo vencido hace más del margen', async () => {
    const redis = makeMock();
    await redis.del(DEBOUNCE_REDIS_KEY);
    const now = Date.now();
    await redis.zadd(DEBOUNCE_REDIS_KEY, now - 5 * 60_000, '1'); // atascada
    await redis.zadd(DEBOUNCE_REDIS_KEY, now - 10_000, '2'); // recién vencida
    await redis.zadd(DEBOUNCE_REDIS_KEY, now + 25_000, '3'); // aún esperando
    expect(await overdueDebouncesCount(redis, 60_000, now)).toBe(1);
  });
});

describe('createThrottledLog', () => {
  it('escribe la primera vez y luego una vez por intervalo, con los avisos callados', () => {
    let t = 0;
    const log = createThrottledLog(60_000, () => t);
    const written: number[] = [];
    const write = (suppressed: number) => written.push(suppressed);

    log(write); // t=0 → escribe
    t = 5_000;
    log(write); // callado
    t = 10_000;
    log(write); // callado
    t = 60_000;
    log(write); // escribe con 2 callados
    expect(written).toEqual([0, 2]);
  });
});
