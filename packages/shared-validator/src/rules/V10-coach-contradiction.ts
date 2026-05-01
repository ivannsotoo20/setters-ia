import type { ValidationRule } from '../types.js';

/**
 * STUB. Detectar contradicción con el banco de frases del coach requiere
 * embedding/RAG semántico. Lo dejaremos como heurística cuando integremos
 * un store de embeddings (probablemente con pgvector en Supabase).
 */
export const V10_coachContradiction: ValidationRule = {
  id: 'V10',
  description: 'Contradicción con el banco de frases del coach',
  stub: true,
  check: () => null,
};
