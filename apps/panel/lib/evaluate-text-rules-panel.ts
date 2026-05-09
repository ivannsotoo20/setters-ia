import type { SupabaseClient } from '@supabase/supabase-js';
import { matchTextRule, type MatchableRule } from './labels-match';
import { computeLabelSideEffects, hasSideEffects } from './labels-side-effects';

/**
 * Espejo simplificado del motor `evaluate-text-rules.ts` + `apply-label.ts`
 * para usar desde el panel cuando el trainer envía un mensaje humano via
 * `sendManualMessage`. Best-effort: no rompe el send aunque falle.
 *
 * Lógica idéntica al motor:
 *   1. Cargar reglas activas text_contains/text_exact del tenant.
 *   2. Para cada match → INSERT idempotente en conversation_labels
 *      (ON CONFLICT skip) + side effects (pause/resume/assign).
 */

export interface EvaluateTextRulesPanelInput {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  source: 'lead' | 'human';
  body: string;
  actorUserId?: string | null;
}

export async function evaluateTextRulesPanel(
  input: EvaluateTextRulesPanelInput,
): Promise<{ appliedLabelIds: number[]; errors: string[] }> {
  const { supabase, tenantId, conversationId, source, body, actorUserId } = input;
  const result: { appliedLabelIds: number[]; errors: string[] } = {
    appliedLabelIds: [],
    errors: [],
  };

  if (!body || body.trim().length === 0) return result;

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

    try {
      const labelId = Number(r.label_id);

      // 1) Comprobar si ya está aplicada (idempotencia).
      const { data: existing } = await supabase
        .from('conversation_labels')
        .select('label_id')
        .eq('conversation_id', conversationId)
        .eq('label_id', labelId)
        .maybeSingle();
      if (existing) continue;

      // 2) Cargar la label para side effects.
      const { data: label } = await supabase
        .from('tenant_labels')
        .select('pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
        .eq('id', labelId)
        .maybeSingle();
      if (!label) continue;

      // 3) INSERT.
      const { error: insertErr } = await supabase.from('conversation_labels').insert({
        conversation_id: conversationId,
        label_id: labelId,
        tenant_id: tenantId,
        applied_by: actorUserId ?? null,
        applied_via: 'rule',
      });
      if (insertErr) {
        const code = (insertErr as { code?: string }).code;
        if (code !== '23505') {
          result.errors.push(`apply label ${labelId}: ${insertErr.message}`);
        }
        continue;
      }

      // 4) Side effects.
      const { data: convCurrent } = await supabase
        .from('conversations')
        .select('assigned_user_id')
        .eq('id', conversationId)
        .maybeSingle();
      const patch = computeLabelSideEffects({
        pauseAiOnApply: Boolean(label.pause_ai_on_apply),
        resumeAiOnApply: Boolean(label.resume_ai_on_apply),
        autoAssignTo: label.auto_assign_to as string | null,
        currentAssignedUserId:
          (convCurrent?.assigned_user_id as string | null) ?? null,
      });
      if (hasSideEffects(patch)) {
        await supabase
          .from('conversations')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', conversationId)
          .eq('tenant_id', tenantId);
      }

      result.appliedLabelIds.push(labelId);
    } catch (err) {
      result.errors.push(`apply rule ${r.id}: ${(err as Error).message}`);
    }
  }

  return result;
}
