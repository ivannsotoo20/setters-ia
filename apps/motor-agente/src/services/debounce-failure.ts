/**
 * Qué hacer cuando `processDebounced` lanza (2026-11-12).
 *
 * Antes: reencolar a los 30 s, siempre. Con un fallo que se repite eso es un
 * bucle que paga una llamada al modelo en cada vuelta (conversación 15128 del
 * tenant 7: ~5.200 llamadas en tres días). Ahora el reintento espera cada vez
 * más (`DEBOUNCE_RETRY_DELAYS_S`) y, agotados los intentos, la conversación sale
 * de la cola y se avisa a los agency admins con un `error_motor`.
 *
 * Nunca lanza: lo llama el cron dentro de su propio catch.
 */
import type { Redis } from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';
import {
  enqueueDebounceOrDefer,
  registerDebounceFailure,
  DEBOUNCE_RETRY_DELAYS_S,
} from '../lib/debounce-buffer.js';

type SupabaseTyped = SupabaseClient<Database>;

export const DEBOUNCE_ABANDONED_EVENT_KIND = 'ai_turn_abandoned';

interface Log {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface HandleDebounceFailureDeps {
  redis: Redis;
  supabase: SupabaseTyped;
  log: Log;
}

export type DebounceFailureOutcome =
  | { action: 'requeued'; attempt: number; retryDelayS: number }
  | { action: 'abandoned'; attempt: number };

export async function handleDebounceFailure(
  deps: HandleDebounceFailureDeps,
  conversationId: number,
  err: unknown,
): Promise<DebounceFailureOutcome> {
  const { redis, supabase, log } = deps;
  const errorMessage = err instanceof Error ? err.message : String(err);

  let attempt: number;
  let retryDelayS: number | null;
  try {
    ({ attempt, retryDelayS } = await registerDebounceFailure(redis, conversationId));
  } catch (countErr) {
    // Sin Redis no hay contador. Se reintenta con la primera espera y se
    // aplaza en memoria si tampoco acepta el encolado: perder la conversación
    // sería peor que un reintento de más mientras Redis vuelve.
    const firstDelay = DEBOUNCE_RETRY_DELAYS_S[0] ?? 30;
    log.error(
      { err, conversationId, countErr: (countErr as Error).message, retryDelayS: firstDelay },
      'processDebounced failed; sin contador de intentos (Redis), reintento con la espera mínima',
    );
    await enqueueDebounceOrDefer(redis, conversationId, firstDelay);
    return { action: 'requeued', attempt: 0, retryDelayS: firstDelay };
  }

  if (retryDelayS !== null) {
    log.error(
      { err, conversationId, attempt, retryDelayS },
      'processDebounced failed; re-queueing with delay',
    );
    // Ya se reclamó (ZREM): si Redis tampoco acepta el re-encolado, se aplaza en
    // memoria en vez de perder la conversación.
    await enqueueDebounceOrDefer(redis, conversationId, retryDelayS);
    return { action: 'requeued', attempt, retryDelayS };
  }

  log.error(
    { err, conversationId, attempt },
    'processDebounced failed; intentos agotados, la conversación sale de la cola',
  );
  await notifyAbandoned(supabase, log, conversationId, attempt, errorMessage);
  return { action: 'abandoned', attempt };
}

async function notifyAbandoned(
  supabase: SupabaseTyped,
  log: Log,
  conversationId: number,
  attempt: number,
  errorMessage: string,
): Promise<void> {
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('tenant_id')
      .eq('id', conversationId)
      .maybeSingle();
    const tenantId = conv?.tenant_id != null ? Number(conv.tenant_id) : null;
    if (tenantId == null) {
      log.warn({ conversationId }, 'debounce abandonado: conversación sin tenant, no se avisa');
      return;
    }
    // Aviso técnico a los agency admins, igual que la alerta de IA muda
    // (`silent-ai-check.ts`): `enqueueNotification` solo admite los eventos
    // del entrenador.
    const { error: insErr } = await supabase.from('notification_events').insert({
      tenant_id: tenantId,
      event_type: 'error_motor',
      status: 'pending',
      payload: {
        kind: DEBOUNCE_ABANDONED_EVENT_KIND,
        conversation_id: conversationId,
        attempts: attempt,
        error: errorMessage.slice(0, 500),
        what_happened:
          'La IA no pudo generar la respuesta de este turno tras varios intentos espaciados. ' +
          'La conversación ha salido de la cola: nadie le va a contestar hasta que escriba de nuevo o alguien intervenga.',
      } as Database['public']['Tables']['notification_events']['Insert']['payload'],
    });
    if (insErr) {
      log.warn({ conversationId, err: insErr.message }, 'debounce abandonado: no se pudo encolar el aviso');
    }
  } catch (notifyErr) {
    log.warn(
      { conversationId, err: (notifyErr as Error).message },
      'debounce abandonado: fallo al avisar',
    );
  }
}
