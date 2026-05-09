import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper compartido motor: aplica una etiqueta a una conversación con UPSERT
 * idempotente y side effects (pause/resume/assign).
 *
 * Si la etiqueta ya está aplicada → no-op (no re-ejecuta side effects, no
 * duplica). Esto es importante porque applySystemLabels se invoca en cada
 * turno del pipeline; sin idempotencia, pausaría IA repetidamente.
 *
 * Para envíos manuales desde panel ya se hace su propia versión via server
 * action `applyLabel` en `apps/panel/lib/actions/labels.ts`. Este archivo
 * sirve al motor (post-pipeline + reglas de texto + cron inactividad).
 */

export type AppliedVia = 'manual' | 'rule' | 'system_hook';

export interface ApplyLabelInput {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  labelId: number;
  via: AppliedVia;
  actorUserId?: string | null;
}

export interface ApplyLabelResult {
  applied: boolean;       // true si se hizo INSERT (era nuevo); false si ya estaba
  sideEffectsApplied: {
    pausedAi: boolean;
    resumedAi: boolean;
    assignedUser: boolean;
  };
}

export async function applyLabelMotor(input: ApplyLabelInput): Promise<ApplyLabelResult> {
  const { supabase, tenantId, conversationId, labelId, via, actorUserId } = input;

  // 1) Comprobar si ya está aplicada (idempotencia).
  const { data: existing } = await supabase
    .from('conversation_labels')
    .select('label_id')
    .eq('conversation_id', conversationId)
    .eq('label_id', labelId)
    .maybeSingle();

  if (existing) {
    return {
      applied: false,
      sideEffectsApplied: { pausedAi: false, resumedAi: false, assignedUser: false },
    };
  }

  // 2) Cargar la label para conocer side effects.
  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', labelId)
    .maybeSingle();

  if (!label) {
    throw new Error(`applyLabelMotor: label ${labelId} no encontrada`);
  }
  if (Number(label.tenant_id) !== tenantId) {
    throw new Error(
      `applyLabelMotor: label ${labelId} no pertenece a tenant ${tenantId}`,
    );
  }

  // 3) INSERT idempotente.
  const { error: insertErr } = await supabase.from('conversation_labels').insert({
    conversation_id: conversationId,
    label_id: labelId,
    tenant_id: tenantId,
    applied_by: actorUserId ?? null,
    applied_via: via,
  });

  // 23505 = duplicate key (race condition con otro hook). Tratar como ya aplicado.
  if (insertErr) {
    const code = (insertErr as { code?: string }).code;
    if (code === '23505') {
      return {
        applied: false,
        sideEffectsApplied: { pausedAi: false, resumedAi: false, assignedUser: false },
      };
    }
    throw new Error(`applyLabelMotor: insert failed: ${insertErr.message}`);
  }

  // 4) Side effects.
  const sideEffects = {
    pausedAi: false,
    resumedAi: false,
    assignedUser: false,
  };

  const { data: currentConv } = await supabase
    .from('conversations')
    .select('assigned_user_id')
    .eq('id', conversationId)
    .maybeSingle();
  const currentAssigned = (currentConv?.assigned_user_id as string | null) ?? null;

  const patch: Record<string, unknown> = {};
  if (label.resume_ai_on_apply === true) {
    patch.ai_paused_until = null;
    sideEffects.resumedAi = true;
  } else if (label.pause_ai_on_apply === true) {
    patch.ai_paused_until = 'infinity';
    sideEffects.pausedAi = true;
  }
  if (label.auto_assign_to && !currentAssigned) {
    patch.assigned_user_id = label.auto_assign_to;
    sideEffects.assignedUser = true;
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    await supabase
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
  }

  return { applied: true, sideEffectsApplied: sideEffects };
}
