'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { sanitizeCustomInstruction } from '@/lib/trainer-prefs-serializer';
import { regenerateTrainerPrefsBlock } from '@/lib/actions/prompts';

/**
 * Server actions CRUD para `trainer_custom_instructions` (Sprint Gamma 2.3).
 *
 * UX: el trainer añade instrucciones libres una por una desde Card 3 de
 * /settings/preferences. Cada CRUD regenera el bloque trainer_prefs_v1 (que
 * concatena todas las activas como bullets en su markdown).
 *
 * Auth: trainer del tenant (effective-tenant) o agency admin (puede editar
 * cualquier tenant via impersonate).
 *
 * Plan: ~/.claude/plans/planifica-c-mo-podemos-seguir-prancy-jellyfish.md
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireTenantAccess(
  tenantId: number,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!Number.isFinite(tenantId) || tenantId <= 0) return { ok: false, error: 'invalid tenantId' };
  if (!eff.isAgencyAdmin && eff.tenantId !== tenantId) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: eff.userId };
}

export interface CustomInstructionRow {
  id: number;
  content: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// listCustomInstructions
// ============================================================================

export async function listCustomInstructions(args: {
  tenantId: number;
}): Promise<{ ok: true; instructions: CustomInstructionRow[] } | { ok: false; error: string }> {
  const auth = await requireTenantAccess(args.tenantId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('trainer_custom_instructions')
    .select('id, content, is_active, sort_order, created_at, updated_at')
    .eq('tenant_id', args.tenantId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    instructions: (data ?? []).map((r) => ({
      id: r.id as number,
      content: r.content as string,
      isActive: r.is_active as boolean,
      sortOrder: r.sort_order as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    })),
  };
}

// ============================================================================
// createCustomInstruction
// ============================================================================

export async function createCustomInstruction(args: {
  tenantId: number;
  content: string;
}): Promise<{ ok: true; instructionId: number } | { ok: false; error: string }> {
  const auth = await requireTenantAccess(args.tenantId);
  if (!auth.ok) return auth;

  const sanitized = sanitizeCustomInstruction(args.content);
  if (!sanitized) return { ok: false, error: 'content vacío o inválido' };

  const supabase = getServiceRoleClient();

  // Calcular sort_order = max+10 para que la nueva instrucción quede al final
  const { data: existing } = await supabase
    .from('trainer_custom_instructions')
    .select('sort_order')
    .eq('tenant_id', args.tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = ((existing?.sort_order as number | undefined) ?? 0) + 10;

  const { data: inserted, error } = await supabase
    .from('trainer_custom_instructions')
    .insert({
      tenant_id: args.tenantId,
      content: sanitized,
      is_active: true,
      sort_order: nextSortOrder,
      created_by: auth.userId,
    })
    .select('id')
    .maybeSingle();

  if (error || !inserted) return { ok: false, error: error?.message ?? 'insert failed' };

  // Regenera trainer_prefs_v1 markdown con la nueva instrucción incluida
  await regenerateTrainerPrefsBlock(args.tenantId, auth.userId);

  revalidatePath('/settings/preferences');
  return { ok: true, instructionId: inserted.id as number };
}

// ============================================================================
// updateCustomInstruction
// ============================================================================

export async function updateCustomInstruction(args: {
  tenantId: number;
  id: number;
  content?: string;
  isActive?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTenantAccess(args.tenantId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  const updates: Database['public']['Tables']['trainer_custom_instructions']['Update'] = {};
  if (args.content !== undefined) {
    const sanitized = sanitizeCustomInstruction(args.content);
    if (!sanitized) return { ok: false, error: 'content vacío o inválido' };
    updates.content = sanitized;
  }
  if (args.isActive !== undefined) {
    updates.is_active = args.isActive;
  }
  if (Object.keys(updates).length === 0) return { ok: false, error: 'sin cambios' };

  const { error } = await supabase
    .from('trainer_custom_instructions')
    .update(updates)
    .eq('id', args.id)
    .eq('tenant_id', args.tenantId);

  if (error) return { ok: false, error: error.message };

  await regenerateTrainerPrefsBlock(args.tenantId, auth.userId);
  revalidatePath('/settings/preferences');
  return { ok: true };
}

// ============================================================================
// deleteCustomInstruction
// ============================================================================

export async function deleteCustomInstruction(args: {
  tenantId: number;
  id: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTenantAccess(args.tenantId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('trainer_custom_instructions')
    .delete()
    .eq('id', args.id)
    .eq('tenant_id', args.tenantId);

  if (error) return { ok: false, error: error.message };

  await regenerateTrainerPrefsBlock(args.tenantId, auth.userId);
  revalidatePath('/settings/preferences');
  return { ok: true };
}
