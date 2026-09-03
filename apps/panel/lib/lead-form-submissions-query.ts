/**
 * Helpers puros de la página /leads/formularios (registro de formularios
 * recibidos por lead-form y veredicto del filtro de cualificación).
 *
 * Viven fuera del fichero `'use server'` porque un módulo de server actions
 * solo puede exportar funciones async; los parsers y constantes van aquí.
 */

export type LeadFormDecision = 'aprobado' | 'rechazado' | 'sin_filtro';
export type LeadFormEvaluator = 'reglas' | 'ia' | 'ninguno';

export const LEAD_FORM_DECISIONS: readonly LeadFormDecision[] = [
  'aprobado',
  'rechazado',
  'sin_filtro',
];

export const LEAD_FORM_DECISION_LABELS: Record<LeadFormDecision, string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  sin_filtro: 'Sin filtro',
};

export const LEAD_FORM_EVALUATOR_LABELS: Record<LeadFormEvaluator, string> = {
  reglas: 'Reglas',
  ia: 'IA',
  ninguno: '—',
};

/** Query param `?decision=` → valor válido o null (= todas). */
export function parseLeadFormDecision(raw: string | undefined | null): LeadFormDecision | null {
  if (!raw) return null;
  return (LEAD_FORM_DECISIONS as readonly string[]).includes(raw)
    ? (raw as LeadFormDecision)
    : null;
}

/**
 * Enmascara un teléfono dejando solo los 3 últimos dígitos: "+34600123456" →
 * "••• 456". Con menos de 4 dígitos no hay nada que preservar y se oculta
 * entero. null/vacío → null.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length < 4) return '•••';
  return `••• ${digits.slice(-3)}`;
}
