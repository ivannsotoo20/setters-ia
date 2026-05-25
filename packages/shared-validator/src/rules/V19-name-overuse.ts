import type { ValidationRule } from '../types.js';

/**
 * V19 — Hito 12.2 — Tope de menciones del nombre del lead.
 *
 * El trainer configura cuántas veces como máximo el setter puede mencionar el
 * nombre del lead en toda la conversación (`leadNameMaxMentions` 0-5). La
 * personalización funciona por contraste — si el setter repite el nombre cada
 * turno, suena forzado y robótico.
 *
 * Cuenta menciones del `leadParsedName` (case-insensitive, word-boundary
 * Unicode-aware, mismo patrón que V17) en:
 *   - el texto del turno actual,
 *   - más todas las apariciones en `ctx.lastAssistantMessages` (turnos previos
 *     del bot — el motor pasa típicamente los últimos 5-10).
 *
 * Si el total > `leadNameMaxMentions` → warn. El orquestador NO hace retry:
 * la heurística es falible (el nombre puede aparecer legítimamente, p.ej. el
 * lead se llama "Andrea Andrea" o el setter está confirmando datos), un retry
 * forzado generaría regresiones. El loggin permite observar tendencias y
 * ajustar la directiva en `core_v5_base` si fuera necesario.
 *
 * Skip silencioso si:
 *   - `leadParsedName` ausente, null o string vacío (lead sin nombre usable o
 *     trainer en modo 'never' → composer ya inyectó directiva "no menciones").
 *   - `leadNameMaxMentions` no es un número entero ≥ 0.
 *
 * Caso especial `leadNameMaxMentions === 0`: cualquier mención dispara warn
 * (alineado con la directiva "no menciones el nombre" emitida por el composer).
 */
export const V19_nameOveruse: ValidationRule = {
  id: 'V19',
  description: 'Tope de menciones del nombre del lead excedido',
  check: (text, ctx) => {
    const name = ctx.leadParsedName?.trim();
    const max = ctx.leadNameMaxMentions;
    if (!name || name.length === 0) return null;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 0) return null;

    const inThisTurn = countAsWord(text, name);
    const history = ctx.lastAssistantMessages ?? [];
    let inHistory = 0;
    for (const msg of history) {
      inHistory += countAsWord(msg, name);
    }
    const total = inThisTurn + inHistory;
    if (total <= max) return null;

    const surplus = total - max;
    return {
      ruleId: 'V19',
      description: `El nombre "${name}" se mencionó ${total} veces (tope ${max}, exceso ${surplus}). Este turno aporta ${inThisTurn}.`,
      severity: 'warn',
      match: name,
      suggestion: `Reformula este turno sin usar el nombre "${name}" — ya se mencionó suficiente en turnos anteriores.`,
    };
  },
};

/**
 * Cuenta cuántas veces `needle` aparece en `haystack` como palabra completa,
 * case-insensitive, con boundaries Unicode-aware (`\p{L}`/`\p{N}` no extienden
 * la palabra). Mismo patrón que V17 `containsAsWord` pero devuelve count.
 *
 * NOTA acentos: matching es estricto en acentos. Si el nombre es "María" y el
 * bot escribe "Maria" sin tilde, NO cuenta — el setter debe respetar el acento
 * original. Diseño explícito para evitar falsos positivos en nombres con
 * tildes españolas que cambian semántica (Andrés vs Andres).
 */
function countAsWord(haystack: string, needle: string): number {
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const phraseLen = lowerNeedle.length;
  let count = 0;
  let startIdx = 0;
  while (true) {
    const idx = lowerHaystack.indexOf(lowerNeedle, startIdx);
    if (idx === -1) return count;
    const charBefore = idx === 0 ? '' : lowerHaystack[idx - 1] ?? '';
    const charAfter =
      idx + phraseLen >= lowerHaystack.length ? '' : lowerHaystack[idx + phraseLen] ?? '';
    if (!isWordChar(charBefore) && !isWordChar(charAfter)) {
      count++;
    }
    startIdx = idx + phraseLen;
  }
}

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;
function isWordChar(c: string): boolean {
  return c !== '' && WORD_CHAR_REGEX.test(c);
}
