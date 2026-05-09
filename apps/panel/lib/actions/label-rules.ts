'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Server Actions para `label_automation_rules` (Sprint Eta).
 *
 * - listRulesForLabel: viewer+.
 * - create / update / delete: owner del tenant + agency admin.
 * - toggle (is_active): admin+ (collaborator puede pausar reglas sin borrar).
 *
 * `trigger_type` enum: 'text_contains' | 'text_exact' | 'attachment' |
 *                      'product' | 'inactivity_hours' | 'comment_keyword'.
 * Solo `text_contains`, `text_exact` y `inactivity_hours` están implementadas
 * en hooks motor (Sprint Eta.4 + Eta.6). Las otras tres quedan como STUB:
 * la UI permite crearlas, el motor las ignora con log warn.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TriggerType =
  | 'text_contains'
  | 'text_exact'
  | 'attachment'
  | 'product'
  | 'inactivity_hours'
  | 'comment_keyword';

export type TriggerWho = 'lead' | 'trainer' | 'any';

export interface RuleRow {
  id: number;
  labelId: number;
  triggerType: TriggerType;
  triggerWho: TriggerWho;
  triggerValue: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const VALID_TYPES: readonly TriggerType[] = [
  'text_contains',
  'text_exact',
  'attachment',
  'product',
  'inactivity_hours',
  'comment_keyword',
];
const VALID_WHO: readonly TriggerWho[] = ['lead', 'trainer', 'any'];

function isOwnerOrAgency(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner';
}

function isCollaboratorOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

/**
 * Valida la shape de `trigger_value` según `trigger_type`. Retorna error
 * legible o null si OK. Sin tipos genéricos para mantener simple.
 */
function validateTriggerValue(
  triggerType: TriggerType,
  value: Record<string, unknown>,
): string | null {
  switch (triggerType) {
    case 'text_contains':
    case 'text_exact':
      if (typeof value.text !== 'string' || value.text.trim().length === 0) {
        return 'trigger_value.text requerido y no vacío';
      }
      if (value.text.length > 200) return 'trigger_value.text >200 chars';
      return null;
    case 'inactivity_hours':
      if (typeof value.hours !== 'number' || !Number.isFinite(value.hours)) {
        return 'trigger_value.hours requerido (number)';
      }
      if (value.hours < 1 || value.hours > 8760) {
        return 'trigger_value.hours fuera de rango [1, 8760]';
      }
      return null;
    case 'attachment':
      if (!Array.isArray(value.types) || value.types.length === 0) {
        return 'trigger_value.types[] requerido (array de tipos)';
      }
      return null;
    case 'product':
    case 'comment_keyword':
      // Stubs: aceptamos cualquier shape; el motor los ignora.
      return null;
  }
}

// ===========================================================================
// listRulesForLabel
// ===========================================================================

export async function listRulesForLabel(labelId: number): Promise<ActionResult<RuleRow[]>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id')
    .eq('id', labelId)
    .maybeSingle();
  if (!label) return { ok: false, error: 'etiqueta no encontrada' };
  if (Number(label.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data, error } = await supabase
    .from('label_automation_rules')
    .select('id, label_id, trigger_type, trigger_who, trigger_value, is_active, created_at')
    .eq('label_id', labelId)
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows: RuleRow[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    labelId: Number(r.label_id),
    triggerType: r.trigger_type as TriggerType,
    triggerWho: r.trigger_who as TriggerWho,
    triggerValue: (r.trigger_value as Record<string, unknown>) ?? {},
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
  }));
  return { ok: true, data: rows };
}

// ===========================================================================
// createLabelRule
// ===========================================================================

export interface CreateRuleInput {
  labelId: number;
  triggerType: TriggerType;
  triggerWho: TriggerWho;
  triggerValue: Record<string, unknown>;
  isActive?: boolean;
}

export async function createLabelRule(
  input: CreateRuleInput,
): Promise<ActionResult<{ id: number }>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede crear reglas' };
  }
  if (!VALID_TYPES.includes(input.triggerType)) {
    return { ok: false, error: 'trigger_type inválido' };
  }
  if (!VALID_WHO.includes(input.triggerWho)) {
    return { ok: false, error: 'trigger_who inválido' };
  }
  const validationErr = validateTriggerValue(input.triggerType, input.triggerValue ?? {});
  if (validationErr) return { ok: false, error: validationErr };

  const supabase = getServiceRoleClient();
  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id')
    .eq('id', input.labelId)
    .maybeSingle();
  if (!label) return { ok: false, error: 'etiqueta no encontrada' };
  const labelTenantId = Number(label.tenant_id);
  if (labelTenantId !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data, error } = await supabase
    .from('label_automation_rules')
    .insert({
      tenant_id: labelTenantId,
      label_id: input.labelId,
      trigger_type: input.triggerType,
      trigger_who: input.triggerWho,
      trigger_value: input.triggerValue ?? {},
      is_active: input.isActive !== false,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/labels');
  return { ok: true, data: { id: Number(data.id) } };
}

// ===========================================================================
// updateLabelRule
// ===========================================================================

export interface UpdateRulePatch {
  triggerType?: TriggerType;
  triggerWho?: TriggerWho;
  triggerValue?: Record<string, unknown>;
  isActive?: boolean;
}

export async function updateLabelRule(input: {
  ruleId: number;
  patch: UpdateRulePatch;
}): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede modificar reglas' };
  }

  const supabase = getServiceRoleClient();
  const { data: rule } = await supabase
    .from('label_automation_rules')
    .select('id, tenant_id, trigger_type, trigger_value')
    .eq('id', input.ruleId)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'regla no encontrada' };
  if (Number(rule.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const updates: Record<string, unknown> = {};

  const nextType = (input.patch.triggerType ?? rule.trigger_type) as TriggerType;
  if (input.patch.triggerType !== undefined) {
    if (!VALID_TYPES.includes(input.patch.triggerType)) {
      return { ok: false, error: 'trigger_type inválido' };
    }
    updates.trigger_type = input.patch.triggerType;
  }
  if (input.patch.triggerWho !== undefined) {
    if (!VALID_WHO.includes(input.patch.triggerWho)) {
      return { ok: false, error: 'trigger_who inválido' };
    }
    updates.trigger_who = input.patch.triggerWho;
  }
  if (input.patch.triggerValue !== undefined) {
    const validationErr = validateTriggerValue(nextType, input.patch.triggerValue);
    if (validationErr) return { ok: false, error: validationErr };
    updates.trigger_value = input.patch.triggerValue;
  } else if (input.patch.triggerType !== undefined) {
    // Si cambia type pero value se queda igual, validar contra type nuevo.
    const validationErr = validateTriggerValue(
      nextType,
      (rule.trigger_value as Record<string, unknown>) ?? {},
    );
    if (validationErr) {
      return {
        ok: false,
        error: `trigger_value actual inválido para nuevo type: ${validationErr}`,
      };
    }
  }
  if (input.patch.isActive !== undefined) updates.is_active = input.patch.isActive === true;

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await supabase
    .from('label_automation_rules')
    .update(updates)
    .eq('id', input.ruleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/labels');
  return { ok: true };
}

// ===========================================================================
// toggleRule (admin+)
// ===========================================================================

export async function toggleRule(ruleId: number, isActive: boolean): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isCollaboratorOrAbove(effective)) {
    return { ok: false, error: 'forbidden — viewer no puede pausar reglas' };
  }

  const supabase = getServiceRoleClient();
  const { data: rule } = await supabase
    .from('label_automation_rules')
    .select('id, tenant_id')
    .eq('id', ruleId)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'regla no encontrada' };
  if (Number(rule.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { error } = await supabase
    .from('label_automation_rules')
    .update({ is_active: isActive === true })
    .eq('id', ruleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/labels');
  return { ok: true };
}

// ===========================================================================
// deleteRule
// ===========================================================================

export async function deleteRule(ruleId: number): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede borrar reglas' };
  }

  const supabase = getServiceRoleClient();
  const { data: rule } = await supabase
    .from('label_automation_rules')
    .select('id, tenant_id')
    .eq('id', ruleId)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'regla no encontrada' };
  if (Number(rule.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { error } = await supabase
    .from('label_automation_rules')
    .delete()
    .eq('id', ruleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/labels');
  return { ok: true };
}
