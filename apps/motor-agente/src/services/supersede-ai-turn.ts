/**
 * Turno caducado (2026-11-19, Tania: "a las 13:13 la IA vuelve a preguntar
 * cuánto tiempo lleva con dolor" cuando la persona lo había contado a las 13:12).
 *
 * La IA genera el turno, lo trocea y lo deja programado unos 30 s ("escribiendo",
 * `scheduler.ts`). Si la persona vuelve a escribir en ese hueco, o mientras el
 * modelo aún está generando, el turno sale igual: contesta a una conversación
 * que ya no existe y repregunta lo que acaban de decirle. Medido en el tenant 7
 * del 5 al 19 de noviembre: 110 de 738 turnos (15 %), en 43 de 114 conversaciones.
 *
 * Dos redes, una por cada ventana:
 *  - Al ENTRAR un mensaje de la persona (`cancelSupersededAiTurn`, en los tres
 *    webhooks): las burbujas del turno anterior que aún no han salido se
 *    cancelan. El debounce que encola ese mismo mensaje rehace el turno con
 *    todo, y el historial ya no las tiene porque nunca se enviaron.
 *  - Al TERMINAR de generar (`isSupersedableTurn` + `ProcessDebouncedDeps.isRequeued`
 *    en `process-debounced.ts`): si mientras el modelo pensaba la conversación
 *    volvió a la cola del debounce, el turno no se programa.
 *
 * Solo se cancela lo que el turno siguiente va a rehacer. Si la conversación ya
 * no está activa (cierre por zona, handoff, IA pausada), las burbujas pendientes
 * son la despedida, el vídeo o el aviso de que la atiende Tania, y no hay turno
 * nuevo que las sustituya: salen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAiPausedFromDb } from '../lib/ai-pause.js';
import { logger } from '../lib/logger.js';

export const SUPERSEDED_ERROR = 'superseded: la persona escribió antes de que saliera';

export interface CancelSupersededResult {
  cancelled: number;
  /** Por qué no se tocó nada, si no se tocó nada. */
  skipped?: 'conversation_not_found' | 'not_active' | 'handoff' | 'ai_paused' | 'nothing_pending';
}

/**
 * Cancela las burbujas pendientes del turno de la IA en una conversación activa.
 * Nunca lanza: si falla, el turno sale como antes y se registra.
 */
export async function cancelSupersededAiTurn(
  supabase: SupabaseClient,
  conversationId: number,
): Promise<CancelSupersededResult> {
  try {
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('state, is_handoff_to_human, ai_paused_until')
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) return { cancelled: 0, skipped: 'conversation_not_found' };
    if (String(conv.state ?? '') !== 'active') return { cancelled: 0, skipped: 'not_active' };
    if (conv.is_handoff_to_human === true) return { cancelled: 0, skipped: 'handoff' };
    if (isAiPausedFromDb((conv.ai_paused_until as string | null | undefined) ?? null)) {
      return { cancelled: 0, skipped: 'ai_paused' };
    }

    const { data, error } = await supabase
      .from('message_schedules')
      .update({ status: 'cancelled', last_error: SUPERSEDED_ERROR })
      .eq('conversation_id', conversationId)
      .eq('triggered_by', 'ai_turn')
      .eq('status', 'pending')
      .select('id');
    if (error) throw new Error(error.message);
    const cancelled = (data ?? []).length;
    if (cancelled === 0) return { cancelled: 0, skipped: 'nothing_pending' };
    logger.info(
      { conversationId, cancelled, scheduleIds: (data ?? []).map((r) => Number(r.id)) },
      '[superseded] la persona escribió antes de que saliera el turno: burbujas canceladas, se rehace',
    );
    return { cancelled };
  } catch (err) {
    logger.warn(
      { conversationId, err: err instanceof Error ? err.message : String(err) },
      '[superseded] no se pudieron cancelar las burbujas pendientes (no fatal, salen como antes)',
    );
    return { cancelled: 0 };
  }
}

/**
 * ¿Este turno se puede tirar si la persona escribió mientras se generaba? Solo
 * un turno de conversación normal. Uno que cierra, deriva, pausa o reserva un
 * hueco tiene efectos que el siguiente turno no repite igual (la reserva ya está
 * hecha, la conversación ya está cerrada), así que sale.
 */
export function isSupersedableTurn(setterOutput: {
  conversation_status: string;
  handoff_cause?: string | null;
  proposed_booking_slot?: string | null;
}): boolean {
  const status = setterOutput.conversation_status;
  if (status !== 'active' && status !== 'qualified') return false;
  if (setterOutput.handoff_cause) return false;
  if (typeof setterOutput.proposed_booking_slot === 'string' && setterOutput.proposed_booking_slot.trim()) {
    return false;
  }
  return true;
}
