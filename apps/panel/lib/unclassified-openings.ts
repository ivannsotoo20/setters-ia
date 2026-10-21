/**
 * Aperturas sin clasificar (2026-10-21).
 *
 * Los primeros mensajes con los que la entrenadora abre conversaciones y que el
 * motor no reconoce como su bienvenida: o no casan con ninguna palabra clave (no
 * se crea la conversación, tabla `unmatched_openings`) o casan con una que no es
 * de bienvenida y cuentan como «palabra clave». Caso real (tenant 7): abría con
 * textos que no tenía registrados y nada se lo avisaba, así que el conteo de
 * bienvenidas se rompía en silencio. /keywords los lista con un botón para darlos
 * de alta.
 */

export interface OpeningSample {
  text: string;
  /** ISO 8601: cuándo se escribió. */
  at: string;
}

export interface OpeningGroup {
  /** El texto más reciente del grupo, tal cual. */
  text: string;
  count: number;
  lastAt: string;
  /** Propuesta de palabra clave para el diálogo de alta. */
  suggestedPattern: string;
}

/** Palabras con las que se propone la palabra clave. Con 4 o más, el motor la
 *  reconoce aunque cambien emojis, signos o se meta el nombre de la persona. */
export const SUGGESTED_PATTERN_WORDS = 8;

/**
 * Clave para agrupar dos aperturas que son el mismo texto: minúsculas, sin
 * acentos, solo letras y números y sin letras alargadas («Holaaa» = «hola»).
 * Así un cambio de emoji o de signos no parte el grupo.
 */
export function openingKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/(\p{L})\1+/gu, '$1'))
    .join(' ');
}

/** Las primeras palabras del texto, sin emojis sueltos ni el signo final. */
export function suggestPattern(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, SUGGESTED_PATTERN_WORDS)
    .join(' ')
    .replace(/[,;:.!?¡¿…]+$/u, '');
}

/** Agrupa por texto, de más a menos veces (a igualdad, la más reciente primero). */
export function groupOpenings(samples: OpeningSample[]): OpeningGroup[] {
  const groups = new Map<string, OpeningGroup>();
  for (const s of samples) {
    const key = openingKey(s.text);
    if (key.length === 0) continue;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        text: s.text,
        count: 1,
        lastAt: s.at,
        suggestedPattern: suggestPattern(s.text),
      });
      continue;
    }
    g.count += 1;
    if (Date.parse(s.at) > Date.parse(g.lastAt)) {
      g.lastAt = s.at;
      g.text = s.text;
      g.suggestedPattern = suggestPattern(s.text);
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || Date.parse(b.lastAt) - Date.parse(a.lastAt),
  );
}
