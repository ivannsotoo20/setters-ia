/**
 * Comparación de texto "a lo humano": minúsculas, sin acentos, palabra completa.
 *
 * Nació dentro del cualificador de formularios (lead-qualifier.ts) para comparar
 * el país declarado con la lista de no contacto de la entrenadora. El 2026-09-12
 * se saca aquí porque la misma comparación hace falta sobre los mensajes del
 * chat (zone-policy.ts): si la persona escribe "acá en Colombia", el término
 * tiene que casar igual que en el formulario.
 */

/** Minúsculas, sin diacríticos, sin espacios en los extremos. */
export function normalizeText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Primer término (normalizado) que aparece como PALABRA COMPLETA en el texto
 * normalizado, o null. Palabra completa para que "Mosquito Bay" no sea Quito
 * ni "California" sea Cali.
 */
export function findWholeWordTerm(textNorm: string, terms: string[]): string | null {
  for (const raw of terms) {
    const t = normalizeText(raw);
    if (!t) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}(?![a-z0-9])`);
    if (re.test(textNorm)) return t;
  }
  return null;
}
