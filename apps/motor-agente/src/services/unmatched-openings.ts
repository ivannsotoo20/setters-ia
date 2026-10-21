/**
 * Aperturas que no casan con ninguna palabra clave (2026-10-21).
 *
 * Cuando la entrenadora, o su automatización de GHL, escribe primero a alguien
 * con un texto que no casa con ninguna palabra clave y no hay conversación
 * previa, `routeGhlOutbound` no crea nada (Caso C): la IA no entra y el
 * dashboard no lo cuenta. Antes solo quedaba una línea en el log, que se pierde
 * en cada deploy. Caso real (tenant 7): desde el 8 oct no entró ninguna
 * bienvenida a seguidores nuevos y no había forma de ver qué texto usaba.
 *
 * Aquí se guarda el principio del texto en `unmatched_openings` (migration 082).
 * El panel lo agrupa y lo lista en /keywords con un botón para darlo de alta.
 * Best-effort: si la tabla no está o el insert falla, queda en el log y el
 * webhook sigue igual.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlParsedOutbound } from '@fyzon/channel-adapters';
import { logger } from '../lib/logger.js';

export const UNMATCHED_PREVIEW_MAX_CHARS = 300;

export async function recordUnmatchedOpening(
  supabase: SupabaseClient,
  outbound: GhlParsedOutbound,
  seenAt: string,
): Promise<void> {
  const preview = String(outbound.message ?? '').trim().slice(0, UNMATCHED_PREVIEW_MAX_CHARS);
  if (preview.length === 0) return;
  try {
    const { error } = await supabase.from('unmatched_openings').insert({
      tenant_id: outbound.tenantId,
      channel: outbound.channel ?? null,
      ghl_contact_id: outbound.ghlContactId ?? null,
      preview,
      seen_at: seenAt,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn(
      { tenantId: outbound.tenantId, err: (err as Error).message },
      'unmatched-openings: no se pudo guardar la apertura sin reconocer (¿falta la migration 082?)',
    );
  }
}
