'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { computeLabelSideEffects, hasSideEffects } from '@/lib/labels-side-effects';

/**
 * Server Actions para `tenant_labels` y `conversation_labels` (Sprint Eta).
 *
 * - listLabels / getLabel: viewer+ (cualquier rol del tenant + agency admin).
 * - createLabel / updateLabel / deleteLabel: owner del tenant + agency admin.
 * - applyLabel / removeLabel: owner/admin del tenant + agency admin (no viewer).
 *
 * `is_system=true` labels: protegidas — no se pueden borrar; al editar solo
 * se aceptan cambios a `color`, `description`, `pause_ai_on_apply`,
 * `resume_ai_on_apply`, `auto_assign_to`. Nombre y destination_bucket
 * inmutables (forman la identidad del bucket).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type DestinationBucket = 'chats' | 'hot' | 'done' | 'bought';
export type AppliedVia = 'manual' | 'rule' | 'system_hook';

export interface LabelRow {
  id: number;
  name: string;
  color: string;
  description: string | null;
  isSystem: boolean;
  destinationBucket: DestinationBucket | null;
  pauseAiOnApply: boolean;
  resumeAiOnApply: boolean;
  autoAssignTo: string | null;
  conversationCount: number;
  activeRuleCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const VALID_BUCKETS: readonly DestinationBucket[] = ['chats', 'hot', 'done', 'bought'];

function isOwnerOrAgency(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner';
}

function isCollaboratorOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

// ===========================================================================
// listLabels
// ===========================================================================

export async function listLabels(): Promise<ActionResult<LabelRow[]>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: labels, error } = await supabase
    .from('tenant_labels')
    .select(
      `id, name, color, description, is_system, destination_bucket,
       pause_ai_on_apply, resume_ai_on_apply, auto_assign_to,
       created_at, updated_at`,
    )
    .eq('tenant_id', effective.tenantId)
    .order('is_system', { ascending: false })
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const labelIds = (labels ?? []).map((l) => Number(l.id));
  const convCounts = new Map<number, number>();
  const ruleCounts = new Map<number, number>();

  if (labelIds.length > 0) {
    // Conversation count por label.
    const { data: convRows } = await supabase
      .from('conversation_labels')
      .select('label_id')
      .in('label_id', labelIds)
      .eq('tenant_id', effective.tenantId);
    for (const r of convRows ?? []) {
      const id = Number((r as { label_id: number }).label_id);
      convCounts.set(id, (convCounts.get(id) ?? 0) + 1);
    }

    // Active rule count por label.
    const { data: ruleRows } = await supabase
      .from('label_automation_rules')
      .select('label_id')
      .in('label_id', labelIds)
      .eq('tenant_id', effective.tenantId)
      .eq('is_active', true);
    for (const r of ruleRows ?? []) {
      const id = Number((r as { label_id: number }).label_id);
      ruleCounts.set(id, (ruleCounts.get(id) ?? 0) + 1);
    }
  }

  const rows: LabelRow[] = (labels ?? []).map((l) => ({
    id: Number(l.id),
    name: String(l.name),
    color: String(l.color),
    description: l.description as string | null,
    isSystem: Boolean(l.is_system),
    destinationBucket: l.destination_bucket as DestinationBucket | null,
    pauseAiOnApply: Boolean(l.pause_ai_on_apply),
    resumeAiOnApply: Boolean(l.resume_ai_on_apply),
    autoAssignTo: l.auto_assign_to as string | null,
    conversationCount: convCounts.get(Number(l.id)) ?? 0,
    activeRuleCount: ruleCounts.get(Number(l.id)) ?? 0,
    createdAt: String(l.created_at),
    updatedAt: String(l.updated_at),
  }));

  return { ok: true, data: rows };
}

// ===========================================================================
// createLabel
// ===========================================================================

export interface CreateLabelInput {
  name: string;
  color: string;
  description?: string;
  destinationBucket?: DestinationBucket | null;
  pauseAiOnApply?: boolean;
  resumeAiOnApply?: boolean;
  autoAssignTo?: string | null;
}

export async function createLabel(input: CreateLabelInput): Promise<ActionResult<{ id: number }>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede crear etiquetas' };
  }

  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, error: 'nombre vacío' };
  if (name.length > 80) return { ok: false, error: 'nombre demasiado largo (>80)' };
  if (!HEX_COLOR_REGEX.test(input.color ?? '')) {
    return { ok: false, error: 'color inválido (esperado hex #RRGGBB)' };
  }
  if (
    input.destinationBucket != null &&
    !VALID_BUCKETS.includes(input.destinationBucket)
  ) {
    return { ok: false, error: 'destination_bucket inválido' };
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_labels')
    .insert({
      tenant_id: effective.tenantId,
      name,
      color: input.color,
      description: input.description?.trim() || null,
      is_system: false,
      destination_bucket: input.destinationBucket ?? null,
      pause_ai_on_apply: input.pauseAiOnApply === true,
      resume_ai_on_apply: input.resumeAiOnApply === true,
      auto_assign_to: input.autoAssignTo ?? null,
      created_by: effective.userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'ya existe una etiqueta con ese nombre' };
    }
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  revalidatePath('/labels');
  revalidatePath('/conversations');
  return { ok: true, data: { id: Number(data.id) } };
}

// ===========================================================================
// updateLabel
// ===========================================================================

export interface UpdateLabelPatch {
  name?: string;
  color?: string;
  description?: string | null;
  destinationBucket?: DestinationBucket | null;
  pauseAiOnApply?: boolean;
  resumeAiOnApply?: boolean;
  autoAssignTo?: string | null;
}

export async function updateLabel(input: {
  labelId: number;
  patch: UpdateLabelPatch;
}): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede modificar etiquetas' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing, error: lookupErr } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, is_system')
    .eq('id', input.labelId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'etiqueta no encontrada' };
  if (Number(existing.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const isSystem = Boolean(existing.is_system);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.patch.name !== undefined) {
    if (isSystem) {
      return { ok: false, error: 'no se puede renombrar una etiqueta system' };
    }
    const name = input.patch.name.trim();
    if (!name) return { ok: false, error: 'nombre vacío' };
    if (name.length > 80) return { ok: false, error: 'nombre demasiado largo (>80)' };
    updates.name = name;
  }

  if (input.patch.color !== undefined) {
    if (!HEX_COLOR_REGEX.test(input.patch.color)) {
      return { ok: false, error: 'color inválido (esperado hex #RRGGBB)' };
    }
    updates.color = input.patch.color;
  }

  if (input.patch.description !== undefined) {
    const desc = input.patch.description?.trim() ?? null;
    updates.description = desc && desc.length > 0 ? desc : null;
  }

  if (input.patch.destinationBucket !== undefined) {
    if (isSystem) {
      return { ok: false, error: 'no se puede cambiar destination_bucket de etiqueta system' };
    }
    if (
      input.patch.destinationBucket != null &&
      !VALID_BUCKETS.includes(input.patch.destinationBucket)
    ) {
      return { ok: false, error: 'destination_bucket inválido' };
    }
    updates.destination_bucket = input.patch.destinationBucket;
  }

  if (input.patch.pauseAiOnApply !== undefined) {
    updates.pause_ai_on_apply = input.patch.pauseAiOnApply === true;
  }
  if (input.patch.resumeAiOnApply !== undefined) {
    updates.resume_ai_on_apply = input.patch.resumeAiOnApply === true;
  }
  if (input.patch.autoAssignTo !== undefined) {
    updates.auto_assign_to = input.patch.autoAssignTo ?? null;
  }

  const { error: updateErr } = await supabase
    .from('tenant_labels')
    .update(updates)
    .eq('id', input.labelId);
  if (updateErr) {
    if (updateErr.code === '23505') {
      return { ok: false, error: 'ya existe una etiqueta con ese nombre' };
    }
    return { ok: false, error: updateErr.message };
  }

  revalidatePath('/labels');
  revalidatePath('/conversations');
  return { ok: true };
}

// ===========================================================================
// deleteLabel
// ===========================================================================

export async function deleteLabel(labelId: number): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!isOwnerOrAgency(effective)) {
    return { ok: false, error: 'forbidden — solo el owner puede borrar etiquetas' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing, error: lookupErr } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, is_system')
    .eq('id', labelId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'etiqueta no encontrada' };
  if (Number(existing.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  if (existing.is_system) {
    return { ok: false, error: 'no se puede borrar una etiqueta system' };
  }

  const { error } = await supabase.from('tenant_labels').delete().eq('id', labelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/labels');
  revalidatePath('/conversations');
  return { ok: true };
}

// ===========================================================================
// applyLabel / removeLabel
// ===========================================================================

interface AuthorizedConvCtx {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  role: 'owner' | 'admin' | 'viewer';
}

async function requireConvAndLabelAccess(
  conversationId: number,
  labelId: number,
): Promise<
  | { ok: true; ctx: AuthorizedConvCtx; tenantId: number; label: { pauseAiOnApply: boolean; resumeAiOnApply: boolean; autoAssignTo: string | null } }
  | { ok: false; error: string }
> {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }
  if (!Number.isFinite(labelId) || labelId <= 0) {
    return { ok: false, error: 'invalid labelId' };
  }
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  const convTenantId = Number(conv.tenant_id);
  if (convTenantId !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data: label } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', labelId)
    .maybeSingle();
  if (!label) return { ok: false, error: 'etiqueta no encontrada' };
  if (Number(label.tenant_id) !== convTenantId) {
    return { ok: false, error: 'la etiqueta no pertenece a esta sub-cuenta' };
  }

  return {
    ok: true,
    ctx: {
      userId: eff.userId,
      tenantId: eff.tenantId,
      isAgencyAdmin: eff.isAgencyAdmin,
      role: eff.role,
    },
    tenantId: convTenantId,
    label: {
      pauseAiOnApply: Boolean(label.pause_ai_on_apply),
      resumeAiOnApply: Boolean(label.resume_ai_on_apply),
      autoAssignTo: label.auto_assign_to as string | null,
    },
  };
}

export async function applyLabel(input: {
  conversationId: number;
  labelId: number;
}): Promise<ActionResult> {
  const auth = await requireConvAndLabelAccess(input.conversationId, input.labelId);
  if (!auth.ok) return auth;
  if (!isCollaboratorOrAbove(auth.ctx)) {
    return { ok: false, error: 'forbidden — viewer no puede aplicar etiquetas' };
  }

  const supabase = getServiceRoleClient();

  // Estado actual asignación, para decidir auto_assign_to (no pisar manual).
  const { data: currentConv } = await supabase
    .from('conversations')
    .select('assigned_user_id')
    .eq('id', input.conversationId)
    .maybeSingle();
  const currentAssignedUserId = (currentConv?.assigned_user_id as string | null) ?? null;

  // INSERT idempotente.
  const { error: insertErr } = await supabase
    .from('conversation_labels')
    .upsert(
      {
        conversation_id: input.conversationId,
        label_id: input.labelId,
        tenant_id: auth.tenantId,
        applied_by: auth.ctx.userId,
        applied_via: 'manual',
      },
      { onConflict: 'conversation_id,label_id', ignoreDuplicates: true },
    );
  if (insertErr) return { ok: false, error: insertErr.message };

  // Side effects (pause/resume/assign).
  const patch = computeLabelSideEffects({
    pauseAiOnApply: auth.label.pauseAiOnApply,
    resumeAiOnApply: auth.label.resumeAiOnApply,
    autoAssignTo: auth.label.autoAssignTo,
    currentAssignedUserId,
  });
  if (hasSideEffects(patch)) {
    await supabase
      .from('conversations')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', input.conversationId)
      .eq('tenant_id', auth.tenantId);
  }

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${input.conversationId}`);
  return { ok: true };
}

export async function removeLabel(input: {
  conversationId: number;
  labelId: number;
}): Promise<ActionResult> {
  const auth = await requireConvAndLabelAccess(input.conversationId, input.labelId);
  if (!auth.ok) return auth;
  if (!isCollaboratorOrAbove(auth.ctx)) {
    return { ok: false, error: 'forbidden — viewer no puede quitar etiquetas' };
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversation_labels')
    .delete()
    .eq('conversation_id', input.conversationId)
    .eq('label_id', input.labelId)
    .eq('tenant_id', auth.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${input.conversationId}`);
  return { ok: true };
}
