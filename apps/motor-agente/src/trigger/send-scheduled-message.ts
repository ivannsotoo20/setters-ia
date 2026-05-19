import { task } from '@trigger.dev/sdk';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase.js';

const payloadSchema = z.object({
  scheduleId: z.number().int().positive(),
});
type Payload = z.infer<typeof payloadSchema>;

/**
 * SPIKE — patrón "un schedule, un job".
 *
 * Demuestra cómo sería el modelo alternativo al batch tick: cuando processDebounced
 * inserta N filas en message_schedules, en vez de esperar al siguiente tickOutbound
 * podría hacer `tasks.trigger('send-scheduled-message', { scheduleId }, { delay: ... })`
 * por cada fila, usando el `scheduled_at` como delay nativo de Trigger.dev.
 *
 * Ventajas vs batch tick:
 *  - Latencia mínima (no esperas al siguiente tick).
 *  - Retry granular por schedule (no bloquea otros si uno falla).
 *  - Concurrency limits por tenant aplicables al ID del task.
 *  - Visibilidad 1:1 en dashboard (cada envío es 1 run).
 *
 * Estado del spike: STUB. Lee el schedule, valida, loggea. NO envía. Si el
 * spike valida bien y Iván decide adoptar Trigger, el siguiente paso es
 * refactorizar `outbound-sender.ts` para extraer `sendSingleSchedule(id)` y
 * sustituir este stub por la llamada real.
 */
export const sendScheduledMessage = task({
  id: 'send-scheduled-message',
  maxDuration: 60,
  run: async (payload: Payload, { ctx }) => {
    const parsed = payloadSchema.parse(payload);
    const supabase = getSupabase();

    const { data: row, error } = await supabase
      .from('message_schedules')
      .select('id, conversation_id, status, scheduled_at, attempts, content, provider')
      .eq('id', parsed.scheduleId)
      .maybeSingle();

    if (error) throw new Error(`schedule lookup failed: ${error.message}`);
    if (!row) {
      return { runId: ctx.run.id, scheduleId: parsed.scheduleId, result: 'not_found' };
    }
    if (row.status !== 'pending') {
      return {
        runId: ctx.run.id,
        scheduleId: parsed.scheduleId,
        result: 'already_processed',
        currentStatus: row.status,
      };
    }

    // SPIKE STUB — log only, no real send.
    // Ver outbound-sender.sendNextBatch para la lógica real.
    return {
      runId: ctx.run.id,
      scheduleId: parsed.scheduleId,
      result: 'spike_stub_ok',
      wouldSendVia: row.provider,
      conversationId: row.conversation_id,
      contentChars: row.content?.length ?? 0,
    };
  },
});
