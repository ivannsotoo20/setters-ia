import type { FastifyInstance } from 'fastify';
import { dropDebounce, getExpiredDebounces } from '../lib/debounce-buffer.js';
import { getRedis } from '../lib/redis.js';
import { getSupabase } from '../lib/supabase.js';
import { getAnthropic } from '../lib/anthropic.js';
import { processDebounced } from '../services/process-debounced.js';
import { sendNextBatch } from '../services/outbound-sender.js';

const DEBOUNCE_TICK_MS = 5_000;
const OUTBOUND_TICK_MS = 5_000;

export async function cronSchedulerPlugin(app: FastifyInstance): Promise<void> {
  let debounceTimer: NodeJS.Timeout | null = null;
  let outboundTimer: NodeJS.Timeout | null = null;
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
        try {
          const out = await processDebounced(
            { supabase, anthropic: anthropic as unknown as import('@anthropic-ai/sdk').default },
            entry.conversationId,
          );
          app.log.info(
            { conversationId: entry.conversationId, scheduleIds: out.scheduleIds, parts: out.parts.length, costUsd: out.totalCostUsd },
            'debounce processed',
          );
        } catch (err) {
          app.log.error({ err, conversationId: entry.conversationId }, 'processDebounced failed');
        } finally {
          await dropDebounce(redis, entry.conversationId);
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

  app.addHook('onReady', async () => {
    debounceTimer = setInterval(tickDebounce, DEBOUNCE_TICK_MS);
    outboundTimer = setInterval(tickOutbound, OUTBOUND_TICK_MS);
    app.log.info({ debounceMs: DEBOUNCE_TICK_MS, outboundMs: OUTBOUND_TICK_MS }, 'cron-scheduler started');
  });

  app.addHook('onClose', async () => {
    stopping = true;
    if (debounceTimer) clearInterval(debounceTimer);
    if (outboundTimer) clearInterval(outboundTimer);
    app.log.info('cron-scheduler stopped');
  });
}
