/**
 * Buffer de debounce por conversación usando Redis sorted sets.
 *
 * Para cada conversación con mensajes inbound recientes mantenemos UNA entrada
 * en el sorted set `DEBOUNCE_KEY` con `score = expires_at_ms`.
 *
 * Cuando llega un nuevo mensaje del lead, llamamos `enqueueDebounce` que
 * (re)escribe la entrada con `expires_at = now + debounceWindowSeconds`. El cron
 * `getExpiredDebounces(now)` devuelve los conversation_ids cuyo timer venció.
 *
 * El score se actualiza con cada mensaje → "extiende" automáticamente la ventana.
 *
 * Persistencia: Redis sobrevive a reinicios del motor. Si el cron está caído y
 * los timers vencen, al volver el cron procesa todos los retrasados de golpe.
 *
 * Si es REDIS el que está caído, ver `enqueueDebounceOrDefer` más abajo.
 */
import type { Redis } from 'ioredis';
import { logger } from './logger.js';

const DEBOUNCE_KEY = 'fyzon:debounce:conversations';

export interface DebounceEntry {
  conversationId: number;
  expiresAtMs: number;
}

/**
 * Encola o extiende el debounce para una conversación.
 * Si ya existía una entrada, la sobrescribe con el nuevo `expires_at`.
 */
export async function enqueueDebounce(
  redis: Redis,
  conversationId: number,
  debounceWindowSeconds: number,
): Promise<DebounceEntry> {
  const expiresAtMs = Date.now() + debounceWindowSeconds * 1000;
  await redis.zadd(DEBOUNCE_KEY, expiresAtMs, String(conversationId));
  return { conversationId, expiresAtMs };
}

/**
 * 2026-10-20 — Encolado que no se pierde si Redis no contesta.
 *
 * Con Redis caído el motor ya no espera (ver `redis.ts`): el ZADD falla en
 * milisegundos. Si el webhook se limitara a registrar el fallo, el mensaje
 * quedaría guardado pero ningún tick lo procesaría nunca: la IA muda que
 * vivimos el 17-oct, solo que ahora sin cuelgue. Así que la conversación se
 * apunta en memoria con su vencimiento y el tick la mete en Redis en cuanto
 * vuelve (`flushDeferredDebounces`).
 *
 * Límite conocido: es memoria del proceso. Si el motor se reinicia con Redis
 * caído, lo aplazado se pierde; para eso está la alerta de IA muda
 * (`services/silent-ai-check.ts`). Nunca lanza.
 */
const deferred = new Map<number, number>();

export async function enqueueDebounceOrDefer(
  redis: Redis,
  conversationId: number,
  debounceWindowSeconds: number,
): Promise<{ entry: DebounceEntry; deferred: boolean }> {
  const expiresAtMs = Date.now() + debounceWindowSeconds * 1000;
  try {
    await redis.zadd(DEBOUNCE_KEY, expiresAtMs, String(conversationId));
    return { entry: { conversationId, expiresAtMs }, deferred: false };
  } catch (err) {
    const previous = deferred.get(conversationId) ?? 0;
    deferred.set(conversationId, Math.max(previous, expiresAtMs));
    logger.error(
      { conversationId, err: (err as Error).message, deferredTotal: deferred.size },
      'debounce: Redis no responde; conversación aplazada en memoria hasta que vuelva',
    );
    return { entry: { conversationId, expiresAtMs }, deferred: true };
  }
}

/**
 * Pasa a Redis lo aplazado. Usa NX: si la conversación ya tiene entrada (llegó
 * otro mensaje con Redis ya de vuelta), esa manda, porque su ventana es más
 * reciente. Al primer fallo para y deja el resto para el siguiente tick.
 */
export async function flushDeferredDebounces(
  redis: Redis,
): Promise<{ flushed: number; pending: number }> {
  let flushed = 0;
  for (const [conversationId, expiresAtMs] of [...deferred]) {
    try {
      await redis.zadd(DEBOUNCE_KEY, 'NX', expiresAtMs, String(conversationId));
    } catch {
      break;
    }
    deferred.delete(conversationId);
    flushed++;
  }
  return { flushed, pending: deferred.size };
}

export function deferredDebouncesCount(): number {
  return deferred.size;
}

/** Solo tests. */
export function clearDeferredDebounces(): void {
  deferred.clear();
}

/**
 * Devuelve las conversaciones cuyo timer ya venció (score <= nowMs).
 * NO las elimina; el caller debe llamar `dropDebounce` tras procesar.
 */
export async function getExpiredDebounces(
  redis: Redis,
  nowMs: number = Date.now(),
  limit = 50,
): Promise<DebounceEntry[]> {
  const results = await redis.zrangebyscore(
    DEBOUNCE_KEY,
    0,
    nowMs,
    'WITHSCORES',
    'LIMIT',
    0,
    limit,
  );
  const out: DebounceEntry[] = [];
  for (let i = 0; i < results.length; i += 2) {
    const cid = results[i];
    const score = results[i + 1];
    if (cid != null && score != null) {
      out.push({ conversationId: Number(cid), expiresAtMs: Number(score) });
    }
  }
  return out;
}

/**
 * Elimina la entrada de debounce de una conversación e informa de si la había.
 * Idempotente.
 *
 * El booleano NO es informativo: es un CLAIM. `ZREM` es atómico en Redis, así
 * que entre varios ticks concurrentes que intenten quedarse con la misma
 * conversación, exactamente uno recibe `true`. El que recibe `false` llega
 * tarde: otro ya la tiene y debe dejarla en paz.
 *
 * Antes esta función devolvía `void` y tiraba el retorno de `zrem`. Eso permitía
 * que dos ticks solapados procesaran la misma conversación y que la persona
 * recibiera dos respuestas distintas al mismo mensaje.
 */
export async function dropDebounce(redis: Redis, conversationId: number): Promise<boolean> {
  const removed = await redis.zrem(DEBOUNCE_KEY, String(conversationId));
  return Number(removed) > 0;
}

/**
 * Elimina TODAS las entradas (solo para tests / scripts admin).
 */
export async function clearAllDebounces(redis: Redis): Promise<void> {
  await redis.del(DEBOUNCE_KEY);
}

/**
 * Cuenta cuantas conversaciones hay esperando proceso (informativo).
 */
export async function pendingDebouncesCount(redis: Redis): Promise<number> {
  return redis.zcard(DEBOUNCE_KEY);
}

/**
 * Cuenta las conversaciones que vencieron hace más de `graceMs` y siguen en la
 * cola. Con el tick sano esto es 0 (procesa cada 5 s); si crece, nadie está
 * vaciando la cola.
 */
export async function overdueDebouncesCount(
  redis: Redis,
  graceMs = 60_000,
  nowMs: number = Date.now(),
): Promise<number> {
  return redis.zcount(DEBOUNCE_KEY, 0, nowMs - graceMs);
}

/**
 * Devuelve la primera conversación cuyo timer aún NO venció (debug).
 */
export async function peekNextDebounce(redis: Redis): Promise<DebounceEntry | null> {
  const res = await redis.zrange(DEBOUNCE_KEY, 0, 0, 'WITHSCORES');
  if (res.length < 2) return null;
  const cid = res[0];
  const score = res[1];
  if (cid == null || score == null) return null;
  return { conversationId: Number(cid), expiresAtMs: Number(score) };
}

export const DEBOUNCE_REDIS_KEY = DEBOUNCE_KEY;
