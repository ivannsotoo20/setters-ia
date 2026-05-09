import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLabelMotor } from './apply-label.js';

/**
 * Sprint Eta — aplica las 4 system labels al final del pipeline según el
 * output del Generator + estado de conversation. Se invoca en
 * `process-debounced.ts` paso 9.7 (post-UPDATE phase, pre-notify).
 *
 * Mapeo:
 *   - Hot Lead   ← conversation_status === 'handoff' (cualquier causa).
 *   - Completado ← phase_decision === 6.
 *   - Comprado   ← conversation.ghl_opportunity_status === 'won' (Sprint Theta
 *     dejará dormido este branch hasta que el webhook GHL escriba esa columna).
 *
 * "Activo" se aplica por backfill (Eta.6) — no se aplica per-turn aquí porque
 * generaría ruido. Una conversation activa SIN labels system aplicadas usa el
 * fallback `classifyTab` legacy (Sprint Zeta).
 *
 * Best-effort: si falla, log warn pero NO romper pipeline.
 */

export interface ApplySystemLabelsInput {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  generatorOutput: {
    conversation_status?: string;
    phase_decision?: number;
  };
}

export interface ApplySystemLabelsResult {
  appliedLabels: string[]; // names of labels applied this turn
  errors: string[];
}

export async function applySystemLabels(
  input: ApplySystemLabelsInput,
): Promise<ApplySystemLabelsResult> {
  const { supabase, tenantId, conversationId, generatorOutput } = input;
  const result: ApplySystemLabelsResult = { appliedLabels: [], errors: [] };

  // 1. Cargar las 4 system labels del tenant en una query.
  const { data: systemLabels, error: lookupErr } = await supabase
    .from('tenant_labels')
    .select('id, name, destination_bucket')
    .eq('tenant_id', tenantId)
    .eq('is_system', true);

  if (lookupErr) {
    result.errors.push(`lookup system labels: ${lookupErr.message}`);
    return result;
  }
  if (!systemLabels || systemLabels.length === 0) {
    return result; // tenant no tiene system labels seedeadas (no debería ocurrir)
  }

  const byName = new Map<string, number>();
  for (const l of systemLabels) {
    byName.set(String(l.name), Number(l.id));
  }

  // 2. Decidir qué labels aplicar según señales.
  const toApply: string[] = [];

  if (generatorOutput.conversation_status === 'handoff') {
    toApply.push('Hot Lead');
  }
  if (Number(generatorOutput.phase_decision) === 6) {
    toApply.push('Completado');
  }

  // Comprado: branch dormido hasta Sprint Theta. Cuando esa columna se escriba
  // por webhook GHL, esta detección se activa automáticamente.
  const { data: convFlags } = await supabase
    .from('conversations')
    .select('ghl_opportunity_status')
    .eq('id', conversationId)
    .maybeSingle();
  if (
    convFlags &&
    typeof (convFlags as { ghl_opportunity_status?: string | null }).ghl_opportunity_status === 'string' &&
    (convFlags as { ghl_opportunity_status?: string | null }).ghl_opportunity_status === 'won'
  ) {
    toApply.push('Comprado');
  }

  // 3. Aplicar cada label (idempotente).
  for (const name of toApply) {
    const labelId = byName.get(name);
    if (!labelId) {
      result.errors.push(`system label "${name}" no seedeada en tenant ${tenantId}`);
      continue;
    }
    try {
      const res = await applyLabelMotor({
        supabase,
        tenantId,
        conversationId,
        labelId,
        via: 'system_hook',
      });
      if (res.applied) result.appliedLabels.push(name);
    } catch (err) {
      result.errors.push(`apply ${name}: ${(err as Error).message}`);
    }
  }

  return result;
}
