import type { ValidationRule } from '../types.js';

const PRICE_PATTERNS = [
  /\b\d{2,5}\s?(€|EUR|euros?|USD|\$|MXN|pesos?)\b/i,
  /\b(€|EUR|\$|USD)\s?\d{2,5}\b/i,
  /\bcuesta\s+\d/i,
  /\bel\s+precio\s+es\b/i,
  /\bprecio:\s?\d/i,
];

/**
 * El coach de Pablo dice "No se mencionan precios bajo ninguna circunstancia"
 * antes de la videollamada. Esta regla detecta filtraciones de precio
 * en cualquier fase < 5 (propuesta de llamada).
 *
 * 2026-10-07: el precio que el entrenador autoriza decir tal cual
 * (`ctx.allowedPriceText`, Tania: "entre 600 y 1.200€") se quita del texto antes
 * de buscar. Lo que quede con cifras sigue siendo filtración.
 */
export const V11_priceLeak: ValidationRule = {
  id: 'V11',
  description: 'Mención de precio antes de la videollamada',
  check: (rawText, ctx) => {
    if (ctx.currentPhase >= 6) return null; // En F6 (envío link) y posteriores no hay leak.
    const text = withoutAllowedPrice(rawText, ctx.allowedPriceText);

    for (const pat of PRICE_PATTERNS) {
      const m = text.match(pat);
      if (m) {
        return {
          ruleId: 'V11',
          description: `Precio mencionado en fase ${ctx.currentPhase} ("${m[0]}")`,
          severity: 'error',
          match: m[0],
          suggestion: 'Eliminar referencia al precio. El coach exige NO mencionar precios antes de la videollamada.',
        };
      }
    }
    return null;
  },
};

/** El texto sin las apariciones del precio autorizado (sin distinguir mayúsculas ni espacios). */
function withoutAllowedPrice(text: string, allowed: string | undefined): string {
  const phrase = allowed?.trim();
  if (!phrase) return text;
  const pattern = phrase
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return text.replace(new RegExp(pattern, 'gi'), ' ');
}
