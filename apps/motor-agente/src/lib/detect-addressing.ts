/**
 * Hito 12.1 — Re-export del helper compartido + builder de directiva mirror_lead.
 *
 * La heurística `detectAddressing` vive en `@fyzon/shared-validator` (la usa V18
 * y el motor). Aquí solo añadimos `buildMirrorLeadDirective` que es lógica
 * específica del motor: construir la directiva markdown que se inyecta al
 * system prompt cuando `addressingMode === 'mirror_lead'`.
 */

import { detectAddressing, type AddressingResult } from '@fyzon/shared-validator';

export { detectAddressing };
export type { AddressingResult };

/**
 * Construye la directiva markdown a inyectar en el system prompt por turno
 * cuando `addressingMode === 'mirror_lead'`. El motor llama a esto tras
 * `detectAddressing(lastLeadMessage)` y pasa el resultado como
 * `composeOverrides.extraSystemSuffix`.
 *
 * Si la detección es 'ambiguous', devolvemos null (no inyectamos directiva
 * — el modelo decide naturalmente, lo que típicamente tutea).
 */
export function buildMirrorLeadDirective(detected: AddressingResult): string | null {
  if (detected === 'ambiguous') return null;
  if (detected === 'tu') {
    return (
      '## Tratamiento detectado del lead (Hito 12.1 — mirror_lead)\n\n' +
      'El último mensaje del lead te ha tratado de **TÚ** (pronombres 2ª persona singular: ' +
      'tú/te/ti/tuyo/contigo). Devuélvele en el MISMO registro: conjuga verbos en 2ª persona ' +
      'singular informal ("¿qué tal estás?", "te paso", "cuéntame", "tu objetivo"). NO uses ' +
      '"usted" ni conjugaciones formales. **ESTA REGLA ES ESTRICTA**: el sistema valida tu output.'
    );
  }
  // detected === 'usted'
  return (
    '## Tratamiento detectado del lead (Hito 12.1 — mirror_lead)\n\n' +
    'El último mensaje del lead te ha tratado de **USTED** (pronombres 3ª persona formal: ' +
    'usted/ustedes/consigo, o conjugaciones formales). Devuélvele en el MISMO registro: ' +
    'conjuga verbos en 3ª persona singular formal ("¿cómo está usted?", "le paso", "cuénteme", ' +
    '"su objetivo"). NO uses "tú" ni conjugaciones informales. **ESTA REGLA ES ESTRICTA**: ' +
    'el sistema valida tu output.'
  );
}
