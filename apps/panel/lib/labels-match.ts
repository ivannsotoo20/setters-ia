/**
 * Espejo de `apps/motor-agente/src/services/labels/match-text-rule.ts`
 * para usar desde el panel (sendManualMessage trigger evaluation). Decisión
 * Sprint Eta: duplicar ~30 LOC en lugar de extraer a packages/labels-core.
 *
 * Si cambias uno, sincroniza el otro.
 */

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
  return normBody.includes(normNeedle);
}
