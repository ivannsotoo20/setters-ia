import type { ValidationRule } from '../types.js';

/**
 * Detecta si la fase activa está fuera del rango esperado (1..7).
 * Esto NO valida el texto sino el contexto: si el motor está marcando
 * una fase fantasma, se loggea para debug.
 */
export const V15_phaseGhost: ValidationRule = {
  id: 'V15',
  description: 'Fase fantasma fuera de rango 1..7',
  check: (_text, ctx) => {
    if (Number.isInteger(ctx.currentPhase) && ctx.currentPhase >= 1 && ctx.currentPhase <= 7) {
      return null;
    }
    return {
      ruleId: 'V15',
      description: `currentPhase=${ctx.currentPhase} fuera de rango 1..7`,
      severity: 'error',
      suggestion: 'Forzar fase válida. Probable bug en el Generator que devolvió phase_decision incorrecta.',
    };
  },
};
