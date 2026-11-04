/**
 * Signos de interrogación y exclamación: un solo signo (2026-11-04, Tania).
 *
 * El bloque `trainer_prefs_v1` llevaba para todos los tenants la directriz
 * "usa `??` en lugar de `?`" (Sprint 2.5b/A, pensada para la voz de Roberto o
 * Bea), y el voiceprint de Tania pide justo lo contrario: en 30 días el 24 % de
 * sus mensajes salieron con «??» y 7 de 13 escenarios de la batería con «¿».
 *
 * Con `trainer_preferences.singlePunctuation` la directriz cambia de signo en el
 * bloque y, por debajo del modelo, esta función lo garantiza en código: colapsa
 * `??`, `!!`, `?!` a un solo signo y quita los de apertura. No toca «…», los
 * puntos suspensivos ni los enlaces. Se aplica a cada burbuja justo antes de
 * programarla (motor) y a las partes que devuelve el simulador.
 */

export interface PunctuationOptions {
  /** Quitar también «¿» y «¡». Default true: un voiceprint que pide un solo signo no quiere apertura. */
  stripOpeningMarks?: boolean;
}

const REPEATED_CLOSING = /[?!]{2,}/g;
const OPENING_MARKS = /[¿¡]/g;

/** `??`/`!!`/`?!` → un signo (`?` si hay alguna interrogación); opcionalmente sin `¿¡`. */
export function collapseRepeatedPunctuation(text: string, opts: PunctuationOptions = {}): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  let out = text.replace(REPEATED_CLOSING, (run) => (run.includes('?') ? '?' : '!'));
  if (opts.stripOpeningMarks !== false) {
    out = out.replace(OPENING_MARKS, '');
  }
  return out;
}

/** La misma normalización sobre todas las burbujas de un turno. */
export function normalizePartsPunctuation(parts: ReadonlyArray<string>, opts: PunctuationOptions = {}): string[] {
  return parts.map((p) => collapseRepeatedPunctuation(p, opts));
}
