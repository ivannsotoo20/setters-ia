import type { FastifyInstance } from 'fastify';
import { dropDebounce, enqueueDebounce, getExpiredDebounces } from '../lib/debounce-buffer.js';
import { getRedis } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { getAnthropic } from '../lib/anthropic.js';
import { processDebounced } from '../services/process-debounced.js';
import { sendNextBatch } from '../services/outbound-sender.js';
import { processNotificationQueue } from '../services/notify-trainer.js';
import { evaluateInactivityRules } from '../services/labels/index.js';
import { runAutoFollowupCron } from '../services/auto-followup-cron.js';

const DEBOUNCE_TICK_MS = 5_000;
const OUTBOUND_TICK_MS = 5_000;
const NOTIFY_TICK_MS = 10_000;
const INACTIVITY_TICK_MS = 60 * 60 * 1_000; // 1h
const AUTO_FOLLOWUP_TICK_MS = 15 * 60 * 1_000; // 15min
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
  let stopping = false;

  const tickDebounce = async () => {
    if (stopping) return;
    try {
      const redis = getRedis();
      const expired = await getExpiredDebounces(redis, Date.now(), 25);
      if (expired.length === 0) return;
      const supabase = getSupabase();
      const anthropic = getAnthropic();
      for (const entry of expired) {
        // Drop ANTES de procesar para que el proximo tick no recoja la misma
        // conversacion mientras esta corriendo el pipeline (race condition que
        // duplicaba la respuesta del setter). Si processDebounced falla,
        // re-encolamos con un delay corto para reintentar.
        await dropDebounce(redis, entry.conversationId);
        try {
          const out = await processDebounced(
            { supabase, anthropic: anthropic as unknown as import('@anthropic-ai/sdk').default },
            entry.conversationId,
          );
          app.log.info(
            {
              conversationId: entry.conversationId,
              correlationId: out.correlationId,
              scheduleIds: out.scheduleIds,
              parts: out.parts.length,
              costUsd: out.totalCostUsd,
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

  app.addHook('onReady', async () => {
    debounceTimer = setInterval(tickDebounce, DEBOUNCE_TICK_MS);
    outboundTimer = setInterval(tickOutbound, OUTBOUND_TICK_MS);
    notifyTimer = setInterval(tickNotify, NOTIFY_TICK_MS);
    inactivityTimer = setInterval(tickInactivity, INACTIVITY_TICK_MS);
    autoFollowupTimer = setInterval(tickAutoFollowup, AUTO_FOLLOWUP_TICK_MS);
    app.log.info(
      {
        debounceMs: DEBOUNCE_TICK_MS,
        outboundMs: OUTBOUND_TICK_MS,
        notifyMs: NOTIFY_TICK_MS,
        inactivityMs: INACTIVITY_TICK_MS,
        autoFollowupMs: AUTO_FOLLOWUP_TICK_MS,
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
    app.log.info('cron-scheduler stopped');
  });
}
