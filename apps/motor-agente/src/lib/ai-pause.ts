/**
 * Helper para detectar si la IA está pausada en una conversación, leyendo
 * `conversations.ai_paused_until` del row Supabase.
 *
 * Bug fix (2026-05-12): PostgreSQL acepta `'infinity'` como valor TIMESTAMPTZ
 * para indicar pausa permanente. Pero `new Date('infinity')` en JavaScript
 * devuelve `Invalid Date` (NaN). El código previo hacía:
 *
 *     const ts = new Date(rawValue);
 *     if (Number.isFinite(ts.getTime()) && ts.getTime() > Date.now()) ...
 *
 * Como `NaN` no es finite, la pausa `'infinity'` se ignoraba silenciosamente.
 * Resultado: todo lead con `ai_paused_until='infinity'` seguía recibiendo
 * respuestas IA — exactamente lo opuesto a lo deseado.
 *
 * Este helper maneja correctamente:
 *   - null / undefined / '' → false (IA activa).
 *   - 'infinity' literal → true (pausa permanente).
 *   - ISO timestamp futuro → true.
 *   - ISO timestamp pasado → false.
 *   - Cualquier valor no parseable → true (fail-safe: si el motor no entiende
 *     el valor, asume pausa para evitar disparar IA accidentalmente).
 *
 * Replica la lógica de `apps/panel/components/conversation-layout/format-helpers.ts:isAiPaused`.
 */
export function isAiPausedFromDb(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  // PostgreSQL especial: 'infinity' = pausa permanente.
  if (raw === 'infinity') return true;
  // '-infinity' es pasado infinito; no debería ocurrir en producción, pero
  // por seguridad lo tratamos como NO pausada (IA activa).
  if (raw === '-infinity') return false;
  const ts = Date.parse(raw);
  // Si el valor no es parseable, FAIL-SAFE: tratar como pausada. Mejor no
  // disparar IA por un valor raro que dispararla cuando no debíamos.
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}
