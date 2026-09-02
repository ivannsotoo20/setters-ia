import type { FastifyInstance } from 'fastify';
import { dropDebounce, enqueueDebounce, getExpiredDebounces } from '../lib/debounce-buffer.js';
import { getRedis } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { processDebounced } from '../services/process-debounced.js';
import { sendNextBatch } from '../services/outbound-sender.js';
import { processNotificationQueue } from '../services/notify-trainer.js';
import { evaluateInactivityRules } from '../services/labels/index.js';
import { runAutoFollowupCron } from '../services/auto-followup-cron.js';
import { checkIntegrationsHealth } from '../services/integration-health-check.js';
import { env } from '../config/env.js';

const DEBOUNCE_TICK_MS = 5_000;
const OUTBOUND_TICK_MS = 5_000;
const NOTIFY_TICK_MS = 10_000;
const INACTIVITY_TICK_MS = 60 * 60 * 1_000; // 1h
const AUTO_FOLLOWUP_TICK_MS = 15 * 60 * 1_000; // 15min
const INTEGRATION_HEALTH_TICK_MS = 30 * 60 * 1_000; // 30min (Sprint Iota.5 PR-D)
/**
 * Si processDebounced lanza, re-encolamos la conversacion con este delay.
 * Suficientemente corto para reintentar pronto, suficientemente largo para
 * no martillar bajo errores transitorios.
 */
const DEBOUNCE_RETRY_DELAY_S = 30;

export async function cronSchedulerPlugin(app: FastifyInstance): Promise<void> {
  let debounceTimer: NodeJS.Timeout | null = null;
  let outboundTimer: NodeJS.Timeout | null = null;
  let notifyTimer: NodeJS.Timeout | null = null;
  let inactivityTimer: NodeJS.Timeout | null = null;
  let autoFollowupTimer: NodeJS.Timeout | null = null;
  let integrationHealthTimer: NodeJS.Timeout | null = null;
  let stopping = false;

  const tickDebounce = async () => {
    if (stopping) return;
    try {
      const redis = getRedis();
      const expired = await getExpiredDebounces(redis, Date.now(), 25);
      if (expired.length === 0) return;
      const supabase = getSupabase();
      // El cliente Anthropic NO se construye aqui: cada conversacion del lote
      // puede ser de un tenant distinto, y processDebounced lo resuelve por
      // tenant en cuanto sabe de quien es (clave propia del entrenador si la
      // trajo).
      for (const entry of expired) {
        // `dropDebounce` es el CLAIM, no una limpieza: `ZREM` es atomico, asi
        // que solo el tick que se queda con la conversacion recibe true.
        //
        // Hace falta porque `expired` es un SNAPSHOT: las conversaciones que van
        // detras en la lista siguen vivas en Redis mientras el pipeline procesa
        // las de delante, y con el pipeline por encima de 5s el tick siguiente
        // llega a verlas y se las lleva. Sin este claim, ambos ticks corren el
        // pipeline de la misma conversacion y la persona recibe dos respuestas
        // distintas al mismo mensaje.
        //
        // Si processDebounced falla, re-encolamos con un delay corto.
        const claimed = await dropDebounce(redis, entry.conversationId);
        if (!claimed) {
          app.log.debug(
            { conversationId: entry.conversationId },
            'debounce entry ya reclamada por otro tick; se omite',
          );
          continue;
        }
        try {
          const out = await processDebounced({ supabase }, entry.conversationId);
          app.log.info(
            {
              conversationId: entry.conversationId,
              correlationId: out.correlationId,
              scheduleIds: out.scheduleIds,
              parts: out.parts.length,
              costUsd: out.totalCostUsd,
              // 2026-09-02: un skip silencioso escondia 6 leads de Facebook sin
              // respuesta (canal sin integration_account). La razon va al log.
              skipped: out.skipped ?? false,
              reason: out.reason ?? null,
            },
            'debounce processed',
          );
        } catch (err) {
          app.log.error(
            { err, conversationId: entry.conversationId, retryDelayS: DEBOUNCE_RETRY_DELAY_S },
            'processDebounced failed; re-queueing with delay',
          );
          await enqueueDebounce(redis, entry.conversationId, DEBOUNCE_RETRY_DELAY_S);
        }
      }
    } catch (err) {
      app.log.error({ err }, 'tickDebounce error');
    }
  };

  const tickOutbound = async () => {
    if (stopping) return;
    try {
      const supabase = getSupabase();
      const result = await sendNextBatch({ supabase });
      if (result.picked > 0) {
        app.log.info(
          { picked: result.picked, sent: result.sent, retried: result.retried, failed: result.failed },
          'outbound batch processed',
        );
      }
    } catch (err) {
      app.log.error({ err }, 'tickOutbound error');
    }
  };

  const tickNotify = async () => {
    if (stopping) return;
    try {
      const supabase = getSupabase();
      const result = await processNotificationQueue({
        supabase,
        log: app.log as unknown as {
          info: (obj: unknown, msg?: string) => void;
          warn: (obj: unknown, msg?: string) => void;
          error: (obj: unknown, msg?: string) => void;
        },
      });
      if (result.picked > 0) {
        app.log.info(
          {
            picked: result.picked,
            sent: result.sent,
            skipped: result.skipped,
            retried: result.retried,
            failed: result.failed,
          },
          'notify batch processed',
        );
      }
    } catch (err) {
      app.log.error({ err }, 'tickNotify error');
    }
  };

  const tickInactivity = async () => {
    if (stopping) return;
    try {
      const supabase = getSupabase();
      const result = await evaluateInactivityRules(supabase);
      if (result.rulesEvaluated > 0 || result.conversationsLabeled > 0) {
        app.log.info(
          {
            rulesEvaluated: result.rulesEvaluated,
            conversationsLabeled: result.conversationsLabeled,
            errors: result.errors.length,
          },
          'inactivity rules evaluated',
        );
      }
      if (result.errors.length > 0) {
        app.log.warn({ errors: result.errors.slice(0, 5) }, 'inactivity rules: errors');
      }
    } catch (err) {
      app.log.error({ err }, 'tickInactivity error');
    }
  };

  const tickAutoFollowup = async () => {
    if (stopping) return;
    try {
      const supabase = getSupabase();
      const result = await runAutoFollowupCron(supabase);
      if (result.scheduled > 0 || result.candidatesFound > 0) {
        app.log.info(
          {
            tenantsEvaluated: result.tenantsEvaluated,
            candidatesFound: result.candidatesFound,
            scheduled: result.scheduled,
            skippedOutOfWindow: result.skippedOutOfWindow,
            skippedNoTemplate: result.skippedNoTemplate,
            skippedMaxReached: result.skippedMaxReached,
            errors: result.errors.length,
          },
          'auto-followup cron completed',
        );
      }
      if (result.errors.length > 0) {
        app.log.warn({ errors: result.errors.slice(0, 5) }, 'auto-followup: errors');
      }
    } catch (err) {
      app.log.error({ err }, 'tickAutoFollowup error');
    }
  };

  const tickIntegrationHealth = async () => {
    if (stopping) return;
    try {
      const supabase = getSupabase();
      const result = await checkIntegrationsHealth({
        supabase,
        log: app.log as unknown as {
          info: (obj: unknown, msg?: string) => void;
          warn: (obj: unknown, msg?: string) => void;
          error: (obj: unknown, msg?: string) => void;
        },
      });
      if (result.enqueued > 0 || result.errors > 0) {
        app.log.info(
          {
            scanned: result.scanned,
            enqueued: result.enqueued,
            skipped: result.skipped,
            errors: result.errors,
          },
          'integration-health-check completed',
        );
      }
    } catch (err) {
      app.log.error({ err }, 'tickIntegrationHealth error');
    }
  };

  app.addHook('onReady', async () => {
    debounceTimer = setInterval(tickDebounce, DEBOUNCE_TICK_MS);
    // SPIKE Trigger.dev (2026-05-19): si TRIGGER_OUTBOUND_ENABLED=true, el envío
    // de mensajes lo gestiona la task `outboundBatchTick` en Trigger; aquí lo
    // saltamos para evitar doble envío. Default OFF → comportamiento idéntico al previo.
    if (!env.TRIGGER_OUTBOUND_ENABLED) {
      outboundTimer = setInterval(tickOutbound, OUTBOUND_TICK_MS);
    }
    notifyTimer = setInterval(tickNotify, NOTIFY_TICK_MS);
    inactivityTimer = setInterval(tickInactivity, INACTIVITY_TICK_MS);
    autoFollowupTimer = setInterval(tickAutoFollowup, AUTO_FOLLOWUP_TICK_MS);
    integrationHealthTimer = setInterval(tickIntegrationHealth, INTEGRATION_HEALTH_TICK_MS);
    app.log.info(
      {
        debounceMs: DEBOUNCE_TICK_MS,
        outboundMs: env.TRIGGER_OUTBOUND_ENABLED ? 'managed_by_trigger_dev' : OUTBOUND_TICK_MS,
        notifyMs: NOTIFY_TICK_MS,
        inactivityMs: INACTIVITY_TICK_MS,
        autoFollowupMs: AUTO_FOLLOWUP_TICK_MS,
        integrationHealthMs: INTEGRATION_HEALTH_TICK_MS,
      },
      'cron-scheduler started',
    );
  });

  app.addHook('onClose', async () => {
    stopping = true;
    if (debounceTimer) clearInterval(debounceTimer);
    if (outboundTimer) clearInterval(outboundTimer);
    if (notifyTimer) clearInterval(notifyTimer);
    if (inactivityTimer) clearInterval(inactivityTimer);
    if (autoFollowupTimer) clearInterval(autoFollowupTimer);
    if (integrationHealthTimer) clearInterval(integrationHealthTimer);
    app.log.info('cron-scheduler stopped');
  });
}
