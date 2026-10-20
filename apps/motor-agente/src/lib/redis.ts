import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Cliente Redis del motor (cola de debounce + antiduplicado de webhooks).
 *
 * 2026-10-20 — Redis no puede volver a colgar el motor. El 17-oct dejó de
 * contestar con la conexión TCP abierta y, sin `commandTimeout`, ioredis
 * esperaba la respuesta para siempre: el webhook no llegaba a guardar el
 * mensaje y el tick del debounce no procesaba nada, sin una sola línea de error.
 * La IA estuvo muda ~26 h. Ahora todo comando acaba, bien o mal, en segundos:
 *
 *   - `commandTimeout`: si Redis no contesta, el comando falla a los 2 s. Vale
 *     también para los comandos que esperan reconexión (ioredis arma el timer
 *     antes de decidir si escribe o encola).
 *   - `enableOfflineQueue: false`: con la conexión caída o reconectando, el
 *     comando falla al instante en vez de esperar en una cola.
 *   - `maxRetriesPerRequest: 1`: un comando en vuelo cuando se corta la conexión
 *     aguanta un intento de reconexión y, si no, falla.
 *
 * Qué hace cada llamador con el fallo: el antiduplicado deja pasar el mensaje
 * (fail-open, la base de datos tiene su propio antiduplicado) y el encolado del
 * debounce se aplaza en memoria hasta que Redis vuelva (`debounce-buffer.ts`).
 */
export const REDIS_COMMAND_TIMEOUT_MS = 2_000;

/** Un aviso por minuto como mucho mientras Redis siga caído. */
const DEGRADED_LOG_INTERVAL_MS = 60_000;

export function buildRedisOptions(): RedisOptions {
  return {
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Throttle de logs: con Redis caído, ioredis emite un `error` por cada intento
 * de reconexión (hasta uno cada 2 s) y cada webhook o tick que lo toca falla
 * igual. Se escribe la primera vez y luego como mucho una vez por intervalo,
 * con el número de avisos que se callaron entre medias.
 */
export function createThrottledLog(intervalMs: number, now: () => number = Date.now) {
  let lastAt = Number.NEGATIVE_INFINITY;
  let suppressed = 0;
  return (write: (suppressedSinceLast: number) => void): void => {
    const t = now();
    if (t - lastAt >= intervalMs) {
      write(suppressed);
      lastAt = t;
      suppressed = 0;
    } else {
      suppressed++;
    }
  };
}

export function createRedisClient(url: string, overrides: RedisOptions = {}): Redis {
  const client = new Redis(url, { ...buildRedisOptions(), ...overrides });
  const logConnectionError = createThrottledLog(DEGRADED_LOG_INTERVAL_MS);
  let failingSince: number | null = null;

  client.on('error', (err: Error) => {
    // No reventamos el proceso: los llamadores degradan (ver arriba).
    if (failingSince == null) failingSince = Date.now();
    logConnectionError((suppressed) =>
      logger.error({ err: err.message, suppressed }, '[redis] connection error'),
    );
  });
  client.on('ready', () => {
    if (failingSince != null) {
      logger.info(
        { downForMs: Date.now() - failingSince },
        '[redis] connection restored',
      );
      failingSince = null;
    }
  });
  return client;
}

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = createRedisClient(env.REDIS_URL);
  }
  return client;
}

/**
 * Espera a que la conexión esté lista, como mucho `timeoutMs`. Sin cola offline,
 * un comando que llega antes de `ready` falla al momento; el arranque espera
 * aquí para que los primeros webhooks no caigan en ese hueco. Si Redis no
 * aparece, devuelve false y el motor arranca igual, degradado.
 */
export function waitForRedisReady(redis: Redis = getRedis(), timeoutMs = 5_000): Promise<boolean> {
  if (redis.status === 'ready') return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      redis.off('ready', onReady);
      resolve(false);
    }, timeoutMs);
    redis.once('ready', onReady);
  });
}

const logDedupSkipped = createThrottledLog(DEGRADED_LOG_INTERVAL_MS);

/**
 * Intenta reservar una clave unica para deduplicacion.
 * Devuelve true si la clave era nueva (se persistio), false si ya existia (duplicado).
 * TTL por defecto 60s — suficiente para cubrir reintentos inmediatos de ManyChat.
 *
 * Si Redis no responde devuelve true (fail-open): preferimos procesar a perder
 * el mensaje. Los reintentos tardíos los para el índice único de
 * `conversation_messages` (migration 080).
 */
export async function tryClaimDedupKey(
  key: string,
  ttlSeconds = 60,
  redis: Redis = getRedis(),
): Promise<boolean> {
  try {
    const res = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  } catch (err) {
    logDedupSkipped((suppressed) =>
      logger.warn({ err: (err as Error).message, suppressed }, '[redis] dedup skipped (fail-open)'),
    );
    return true;
  }
}

export interface RedisPingResult {
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

/**
 * PING con timeout propio, más corto que el `commandTimeout` global, para que
 * `/health` conteste rápido aunque Redis esté colgado.
 */
export async function pingRedis(
  redis: Redis = getRedis(),
  timeoutMs = 1_000,
): Promise<RedisPingResult> {
  const startedAt = Date.now();
  try {
    await withTimeout(redis.ping(), timeoutMs, `redis ping timed out after ${timeoutMs}ms`);
    return { reachable: true, latencyMs: Date.now() - startedAt, error: null };
  } catch (err) {
    return { reachable: false, latencyMs: null, error: (err as Error).message };
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
