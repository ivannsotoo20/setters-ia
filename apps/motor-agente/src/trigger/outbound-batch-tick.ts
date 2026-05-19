import { schedules } from '@trigger.dev/sdk';
import { sendNextBatch } from '../services/outbound-sender.js';
import { getSupabase } from '../lib/supabase.js';

/**
 * SPIKE — réplica de `tickOutbound` del cron-scheduler interno, gestionada por
 * Trigger.dev. Mientras `TRIGGER_OUTBOUND_ENABLED=true` el cron interno se
 * salta su tick y este task se hace cargo (ver plugins/cron-scheduler.ts).
 *
 * Beneficios sobre setInterval (a evaluar):
 *  - Retries con backoff exponencial nativos (config en trigger.config.ts).
 *  - Dashboard con runs históricos, duration, errores, replay manual.
 *  - Concurrency control (1 run a la vez por scheduleId interno → evita
 *    solapamientos si un tick tarda más de 5s).
 *  - Crash-safe: si el worker cae mid-run, Trigger lo reintenta.
 */
export const outboundBatchTick = schedules.task({
  id: 'outbound-batch-tick',
  cron: '*/1 * * * *',
  maxDuration: 60,
  run: async (payload, { ctx }) => {
    const supabase = getSupabase();
    const result = await sendNextBatch({ supabase });
    return {
      runId: ctx.run.id,
      timestamp: payload.timestamp,
      picked: result.picked,
      sent: result.sent,
      retried: result.retried,
      failed: result.failed,
      skipped: result.skipped,
    };
  },
});
