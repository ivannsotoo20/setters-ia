'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { applyLabel, removeLabel, type ActionResult } from './labels';
import { OUTCOME_BUCKETS, type OutcomeBucket } from '@/lib/pipeline-constants';

/**
 * Sprint Kappa — Server Actions del pipeline visual.
 *
 *   - applyPipelineOutcome(conversationId, bucket): aplica el system label cuyo
 *     destination_bucket coincide. Mutual exclusion: remueve previas labels
 *     outcome activas (uno solo a la vez).
 *   - removePipelineOutcome(conversationId): quita TODAS las labels outcome
 *     activas, dejando que la card vuelva a vivir en su phase_number natural.
 *
 * Auth: owner / admin / agency admin. Viewer rechazado.
 * Reuso: ambos llaman a applyLabel / removeLabel de Sprint Eta — los side
 * effects (pause_ai_on_apply etc.) se aplican vía esa capa.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isCollaboratorOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

function isValidBucket(value: unknown): value is OutcomeBucket {
  return typeof value === 'string' && (OUTCOME_BUCKETS as readonly string[]).includes(value);
}

interface AccessOk {
  ok: true;
  tenantId: number;
  userId: string;
  isAgencyAdmin: boolean;
  role: 'owner' | 'admin' | 'viewer';
}

async function requirePipelineAccess(
  conversationId: number,
): Promise<AccessOk | { ok: false; error: string }> {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isCollaboratorOrAbove(eff)) {
    return { ok: false, error: 'forbidden — viewer no puede mover cards en el pipeline' };
  }

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

  return {
    ok: true,
    tenantId: convTenantId,
    userId: eff.userId,
    isAgencyAdmin: eff.isAgencyAdmin,
    role: eff.role,
  };
}

async function listActiveOutcomeLabelIds(
  conversationId: number,
  tenantId: number,
  excludeBucket?: OutcomeBucket,
): Promise<number[]> {
  const supabase = getServiceRoleClient();
  const buckets = (OUTCOME_BUCKETS as readonly OutcomeBucket[]).filter(
    (b) => b !== excludeBucket,
  );
  const { data: rows } = await supabase
    .from('conversation_labels')
    .select(
      `label_id,
       tenant_labels!inner(id, destination_bucket, is_system, tenant_id)`,
    )
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .in('tenant_labels.destination_bucket', buckets);
  return (rows ?? []).map((r) => Number((r as { label_id: number }).label_id));
}

export async function applyPipelineOutcome(input: {
  conversationId: number;
  bucket: OutcomeBucket;
}): Promise<ActionResult> {
  const access = await requirePipelineAccess(input.conversationId);
  if (!access.ok) return access;
  if (!isValidBucket(input.bucket)) {
    return { ok: false, error: 'bucket inválido' };
  }

  const supabase = getServiceRoleClient();
  const { data: targetLabel, error: labelErr } = await supabase
    .from('tenant_labels')
    .select('id')
    .eq('tenant_id', access.tenantId)
    .eq('is_system', true)
    .eq('destination_bucket', input.bucket)
    .maybeSingle();
  if (labelErr) return { ok: false, error: labelErr.message };
  if (!targetLabel) {
    return {
      ok: false,
      error: 'system_label_missing — falta seed para este tenant. Ejecuta backfill.',
    };
  }
  const targetLabelId = Number(targetLabel.id);

  // Mutual exclusion: remueve outcome labels previas (excepto la target si ya estaba).
  const previousIds = await listActiveOutcomeLabelIds(
    input.conversationId,
    access.tenantId,
    input.bucket,
  );
  for (const lid of previousIds) {
    if (lid === targetLabelId) continue;
    const r = await removeLabel({ conversationId: input.conversationId, labelId: lid });
    if (!r.ok) return r;
  }

  // Aplica la nueva (idempotente).
  const r = await applyLabel({ conversationId: input.conversationId, labelId: targetLabelId });
  if (!r.ok) return r;

  revalidatePath('/pipeline');
  return { ok: true };
}

export async function removePipelineOutcome(input: {
  conversationId: number;
}): Promise<ActionResult> {
  const access = await requirePipelineAccess(input.conversationId);
  if (!access.ok) return access;

  const labelIds = await listActiveOutcomeLabelIds(input.conversationId, access.tenantId);
  for (const lid of labelIds) {
    const r = await removeLabel({ conversationId: input.conversationId, labelId: lid });
    if (!r.ok) return r;
  }

  revalidatePath('/pipeline');
  return { ok: true };
}
