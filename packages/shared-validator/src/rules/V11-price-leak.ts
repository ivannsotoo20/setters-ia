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
 */
export const V11_priceLeak: ValidationRule = {
  id: 'V11',
  description: 'Mención de precio antes de la videollamada',
  check: (text, ctx) => {
    if (ctx.currentPhase >= 6) return null; // En F6 (envío link) y posteriores no hay leak.

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
