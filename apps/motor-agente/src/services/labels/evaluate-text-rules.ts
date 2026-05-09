import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLabelMotor } from './apply-label.js';
import { matchTextRule, type MatchableRule } from './match-text-rule.js';

/**
 * Sprint Eta — evalúa todas las reglas activas `text_contains` /
 * `text_exact` del tenant cuando llega un mensaje nuevo del lead o del
 * trainer. Match → applyLabelMotor con via='rule'.
 *
 * Invocado desde:
 *   - `ghl-message-router.ts:routeGhlInbound` post INSERT lead (source='lead').
 *   - `ghl-message-router.ts:routeGhlOutbound` Caso D post INSERT human (source='human').
 *
 * Best-effort: si falla, log warn — no rompe el flujo del mensaje.
 *
 * Stubs: las reglas con trigger_type ∈ {attachment, product, comment_keyword}
 * existen en BD pero el motor las ignora (validateTriggerValue las acepta en UI).
 * Cuando se implementen, se añade el switch case aquí.
 */

export interface EvaluateTextRulesInput {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  source: 'lead' | 'human';
  body: string;
}

export interface EvaluateTextRulesResult {
  matchedRuleIds: number[];
  appliedLabelIds: number[];
  errors: string[];
}

export async function evaluateTextRules(
  input: EvaluateTextRulesInput,
): Promise<EvaluateTextRulesResult> {
  const { supabase, tenantId, conversationId, source, body } = input;
  const result: EvaluateTextRulesResult = {
    matchedRuleIds: [],
    appliedLabelIds: [],
    errors: [],
  };

  if (!body || body.trim().length === 0) return result;

  // Cargar reglas activas text_* del tenant (limit a las 2 trigger types
  // implementadas — el resto se ignora aunque is_active=true).
  const { data: rules, error } = await supabase
    .from('label_automation_rules')
    .select('id, label_id, trigger_type, trigger_who, trigger_value, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('trigger_type', ['text_contains', 'text_exact']);

  if (error) {
    result.errors.push(`load rules: ${error.message}`);
    return result;
  }
  if (!rules || rules.length === 0) return result;

  for (const r of rules) {
    const matchable: MatchableRule = {
      id: Number(r.id),
      triggerType: String(r.trigger_type),
      triggerWho: String(r.trigger_who),
      triggerValue: (r.trigger_value as Record<string, unknown>) ?? {},
      isActive: Boolean(r.is_active),
    };
    if (!matchTextRule(body, source, matchable)) continue;

    result.matchedRuleIds.push(matchable.id);
    try {
      const applyRes = await applyLabelMotor({
        supabase,
        tenantId,
        conversationId,
        labelId: Number(r.label_id),
        via: 'rule',
      });
      if (applyRes.applied) {
        result.appliedLabelIds.push(Number(r.label_id));
      }
    } catch (err) {
      result.errors.push(
        `apply rule ${matchable.id} (label ${r.label_id}): ${(err as Error).message}`,
      );
    }
  }

  return result;
}
