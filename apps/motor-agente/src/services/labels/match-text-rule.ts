/**
 * Helper PURO (sin DB) que evalúa si un mensaje matchea una regla
 * `text_contains` o `text_exact`. Tests unitarios sin mocks.
 *
 * Normalización: lowercase + trim + colapso espacios (mismo enfoque que
 * `automation_keywords` para mantener UX consistente).
 *
 * NOTE: este archivo está duplicado en `apps/panel/lib/labels-match.ts`
 * (decisión Sprint Eta plan: duplicar ~30 LOC en lugar de crear
 * `packages/labels-core` por overhead Turborepo). Si ambos cambian,
 * mantenerlos sincronizados.
 */

export type MatchTriggerType = 'text_contains' | 'text_exact';
export type MatchTriggerWho = 'lead' | 'trainer' | 'any';

export interface MatchableRule {
  id: number;
  triggerType: string;
  triggerWho: string;
  triggerValue: Record<string, unknown>;
  isActive: boolean;
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchTextRule(
  body: string,
  source: 'lead' | 'human',
  rule: MatchableRule,
): boolean {
  if (!rule.isActive) return false;
  if (rule.triggerType !== 'text_contains' && rule.triggerType !== 'text_exact') {
    return false;
  }

  // who matching: lead message → trigger_who must be 'lead' or 'any'.
  // human message → trigger_who must be 'trainer' or 'any'.
  if (source === 'lead' && rule.triggerWho !== 'lead' && rule.triggerWho !== 'any') {
    return false;
  }
  if (source === 'human' && rule.triggerWho !== 'trainer' && rule.triggerWho !== 'any') {
    return false;
  }

  const needle = rule.triggerValue.text;
  if (typeof needle !== 'string' || needle.length === 0) return false;
  const normBody = normalizeForMatch(body);
  const normNeedle = normalizeForMatch(needle);

  if (rule.triggerType === 'text_exact') {
    return normBody === normNeedle;
  }
  // text_contains
  return normBody.includes(normNeedle);
}
