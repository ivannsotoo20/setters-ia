import type { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase.js';
import { getRedis, pingRedis, withTimeout } from '../lib/redis.js';
import {
  deferredDebouncesCount,
  overdueDebouncesCount,
  pendingDebouncesCount,
} from '../lib/debounce-buffer.js';

const startedAt = Date.now();

const SUPABASE_PING_TIMEOUT_MS = 3_000;
const REDIS_PING_TIMEOUT_MS = 1_000;
/** Vencidas hace más de esto y aún en la cola = nadie la está vaciando. */
const DEBOUNCE_OVERDUE_GRACE_MS = 60_000;

/**
 * 2026-10-20 — `/health` mira también Redis.
 *
 * Del 17 al 20 de octubre Redis estuvo colgado y luego en bucle de reinicios, y
 * `/health` seguía diciendo `ok: true`: solo miraba Supabase. Por fuera el motor
 * parecía vivo (webhooks 200, `last_webhook_at` al día) y por dentro la IA no
 * contestaba a nadie.
 *
 * Responde 503 si Redis o Supabase no contestan, para que un monitor externo, o
 * el smoke del CI (`curl -f`), lo vean caído sin tener que leer el JSON.
 * Decisión pendiente de Iván: la alternativa es 200 con `ok: false`.
 *
 * Además de la conexión, informa de la cola de debounce: tamaño, cuántas
 * conversaciones llevan vencidas más de un minuto (con el tick sano es 0) y
 * cuántas esperan en memoria a que Redis vuelva.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const [supabase, redis] = await Promise.all([checkSupabase(app), checkRedis()]);
    const ok = supabase.reachable && redis.reachable;

    return reply.code(ok ? 200 : 503).send({
      ok,
      service: 'motor-agente',
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      supabase_reachable: supabase.reachable,
      prompt_blocks_count: supabase.promptBlocksCount,
      redis_reachable: redis.reachable,
      redis_latency_ms: redis.latencyMs,
      redis_error: redis.error,
      debounce_queue_size: redis.queueSize,
      debounce_overdue: redis.overdue,
      debounce_deferred_in_memory: deferredDebouncesCount(),
    });
  });
}

async function checkSupabase(
  app: FastifyInstance,
): Promise<{ reachable: boolean; promptBlocksCount: number | null }> {
  try {
    const { count, error } = await getSupabase()
      .from('prompt_blocks')
      .select('*', { count: 'exact', head: true })
      .is('tenant_id', null)
      .abortSignal(AbortSignal.timeout(SUPABASE_PING_TIMEOUT_MS));

    if (error) {
      app.log.warn({ err: error }, 'Supabase ping failed');
      return { reachable: false, promptBlocksCount: null };
    }
    return { reachable: true, promptBlocksCount: count ?? 0 };
  } catch (err) {
    app.log.warn({ err }, 'Supabase client threw');
    return { reachable: false, promptBlocksCount: null };
  }
}

async function checkRedis(): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
  queueSize: number | null;
  overdue: number | null;
}> {
  const redis = getRedis();
  const ping = await pingRedis(redis, REDIS_PING_TIMEOUT_MS);
  if (!ping.reachable) {
    return { ...ping, queueSize: null, overdue: null };
  }
  try {
    const [queueSize, overdue] = await withTimeout(
      Promise.all([
        pendingDebouncesCount(redis),
        overdueDebouncesCount(redis, DEBOUNCE_OVERDUE_GRACE_MS),
      ]),
      REDIS_PING_TIMEOUT_MS,
      'debounce queue stats timed out',
    );
    return { ...ping, queueSize, overdue };
  } catch {
    return { ...ping, queueSize: null, overdue: null };
  }
}
