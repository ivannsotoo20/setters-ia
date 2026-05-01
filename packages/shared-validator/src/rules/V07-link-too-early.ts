import type { ValidationRule } from '../types.js';

const URL_REGEX = /\bhttps?:\/\/\S+/i;

/**
 * Sólo se permiten links a partir de la fase 4 (puente) — ahí el coach
 * permite enviar el lead magnet inicial o el link de agenda. Antes de F4
 * un link es vendedor / extraño.
 *
 * Excepción: la fase 1 puede enviar el lead magnet del Drive si el coach
 * tiene "outbound apertura con recurso" — pero eso lo regula el coach
 * directamente, no este validator.
 */
export const V07_linkTooEarly: ValidationRule = {
  id: 'V07',
  description: 'Link enviado antes de fase 4 (puente)',
  check: (text, ctx) => {
    if (ctx.currentPhase >= 4) return null;
    const m = text.match(URL_REGEX);
    if (!m) return null;
    // Excepción común: drive de google con lead magnets de fase 1 outbound.
    // Sólo lanzamos warn — el motor decide.
    return {
      ruleId: 'V07',
      description: `URL en fase ${ctx.currentPhase} (recomendado a partir de F4)`,
      severity: 'warn',
      match: m[0],
      suggestion: 'Si NO es el lead magnet de outbound de F1, posponer el link al puente.',
    };
  },
};
