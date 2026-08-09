/**
 * Interruptor global del setter por entrenador (`tenant_configs.ai_enabled`).
 *
 * Migration 074. Lo acciona el entrenador desde el panel sin depender de nadie.
 *
 * SEMÁNTICA: apagado no es desconectado. Los webhooks se siguen procesando y los
 * mensajes se siguen guardando; la conversación aparece completa en el panel. Lo
 * único que no ocurre es que el setter responda. Al reencender, nada se ha
 * perdido por el camino.
 *
 * Se comprueba en dos sitios, y hacen falta los dos:
 *   - `processDebounced`: no arranca ningún turno nuevo. Cubre todos los canales.
 *   - `sendNextBatch`: no envía las partes que quedaran programadas de un turno
 *     anterior. Sin esto, apagar dejaría salir mensajes durante los segundos
 *     siguientes y el entrenador vería que "sigue escribiendo" después de haberlo
 *     parado, que es justo lo que rompe la confianza en el botón.
 *
 * NO se cachea a propósito: es un control de seguridad y un valor obsoleto de
 * unos segundos es exactamente lo que no queremos. La lectura es una query
 * trivial por clave primaria.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

/**
 * Devuelve `false` solo si la fila dice explícitamente que está apagado.
 *
 * Ante error de lectura o fila ausente devuelve `true` (fail-open), y avisa.
 * El razonamiento, por si alguien quiere invertirlo:
 *
 *   - Fail-closed convertiría un fallo transitorio de lectura en un apagón
 *     global y SILENCIOSO del setter. Ese patrón (algo deja de funcionar sin que
 *     nadie se entere) ya nos ha costado tres bugs de meses en este repo.
 *   - Fail-open, en el peor caso, hace que el setter conteste durante el rato
 *     que dure el fallo pese a estar apagado. Es un riesgo real, pero visible:
 *     el entrenador lo ve en su propio panel.
 *
 * Para cuando se lee esto ya se ha cargado la conversación de la misma base de
 * datos, así que un fallo aquí apunta a fila ausente más que a base caída. Y una
 * fila ausente equivale al DEFAULT de la columna, que es `true`.
 */
export async function isTenantAiEnabled(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('ai_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { tenantId, err: error.message },
      'isTenantAiEnabled: lectura fallida, se asume ENCENDIDO (fail-open)',
    );
    return true;
  }
  if (!data) {
    logger.warn(
      { tenantId },
      'isTenantAiEnabled: sin fila en tenant_configs, se asume ENCENDIDO',
    );
    return true;
  }

  return (data as { ai_enabled?: unknown }).ai_enabled !== false;
}
