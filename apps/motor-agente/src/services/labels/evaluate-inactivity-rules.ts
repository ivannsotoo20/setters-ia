import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLabelMotor } from './apply-label.js';

/**
 * Sprint Eta — evalúa reglas `trigger_type='inactivity_hours'` activas en
 * todos los tenants. Para cada regla, busca conversaciones cuyo
 * `last_message_at < NOW() - X hours` Y aún no tienen la label asociada
 * aplicada → applyLabelMotor con via='rule'.
 *
 * Invocado desde cron 1h en `cron-scheduler.ts`. Best-effort: errores se
 * acumulan en result.errors, no rompe el tick.
 */

export interface EvaluateInactivityRulesResult {
  rulesEvaluated: number;
  conversationsLabeled: number;
  errors: string[];
}

export async function evaluateInactivityRules(
  supabase: SupabaseClient,
): Promise<EvaluateInactivityRulesResult> {
  const result: EvaluateInactivityRulesResult = {
    rulesEvaluated: 0,
    conversationsLabeled: 0,
    errors: [],
  };

  const { data: rules, error } = await supabase
    .from('label_automation_rules')
    .select('id, tenant_id, label_id, trigger_value')
    .eq('trigger_type', 'inactivity_hours')
    .eq('is_active', true);

  if (error) {
    result.errors.push(`load inactivity rules: ${error.message}`);
    return result;
  }
  if (!rules || rules.length === 0) return result;

  const nowIso = new Date().toISOString();

  for (const r of rules) {
    result.rulesEvaluated++;
    const hoursRaw = (r.trigger_value as Record<string, unknown> | null)?.hours;
    const hours = typeof hoursRaw === 'number' ? hoursRaw : Number(hoursRaw);
    if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
      result.errors.push(`rule ${r.id}: trigger_value.hours inválido (${hoursRaw})`);
      continue;
    }

    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const tenantId = Number(r.tenant_id);
    const labelId = Number(r.label_id);

    // Conversaciones del tenant con last_message_at <= cutoff y NO bloqueadas/cerradas.
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .lte('last_message_at', cutoff)
      .not('last_message_at', 'is', null)
      .not('state', 'eq', 'closed')
      .eq('is_blocked', false)
      .limit(500);

    if (convErr) {
      result.errors.push(`rule ${r.id}: query convs: ${convErr.message}`);
      continue;
    }
    if (!convs || convs.length === 0) continue;

    for (const conv of convs) {
      try {
        const applyRes = await applyLabelMotor({
          supabase,
          tenantId,
          conversationId: Number(conv.id),
          labelId,
          via: 'rule',
        });
        if (applyRes.applied) result.conversationsLabeled++;
      } catch (err) {
        result.errors.push(
          `rule ${r.id} conv ${conv.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  void nowIso; // referenciar para no triggerar unused
  return result;
}
