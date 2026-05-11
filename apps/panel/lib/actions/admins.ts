'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import {
  inviteUserAction,
  type InviteActionResult,
} from './invites';

/**
 * Server actions específicas para CRUD de agency admins (Hito 10).
 *
 * Reusa `inviteUserAction` con isAgencyAdmin=true. Añade el guard server-side
 * de "solo agency admin activo puede tocar otros agency admins" y la acción
 * `revokeAdminAction` que marca is_active=false (no borra el row).
 */

export type AdminListItem = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

export type PendingInviteListItem = {
  id: number;
  email: string;
  full_name_hint: string | null;
  invited_by_email: string | null;
  invited_at: string;
  token_expires_at: string;
  is_expired: boolean;
};

async function assertCallerIsAgencyAdmin(): Promise<{
  id: string;
  email: string;
  tenantId: number;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, is_agency_admin, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false || profile.is_agency_admin !== true) {
    throw new Error('forbidden');
  }
  return { id: profile.id, email: profile.email, tenantId: profile.tenant_id };
}

/**
 * Lista los agency admins (activos + inactivos). Incluye datos de auth.users como last_sign_in_at.
 */
export async function listAdminsAction(): Promise<{
  ok: boolean;
  admins?: AdminListItem[];
  error?: string;
}> {
  try {
    await assertCallerIsAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const admin = getServiceRoleClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, full_name, is_active, created_at')
    .eq('is_agency_admin', true)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };

  // `last_sign_in_at` vive en `auth.users` y no es accesible vía `from()` del cliente JS.
  // Para exponerlo necesitamos una RPC o una vista en `public`. Se añade en mejora futura.
  // Por ahora devolvemos null — la UI mostrará "—" en esa columna.
  const items: AdminListItem[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    is_active: p.is_active,
    created_at: p.created_at,
    last_sign_in_at: null,
  }));

  return { ok: true, admins: items };
}

/**
 * Lista los invites de admin pendientes (no aceptados ni revocados).
 */
export async function listAdminPendingInvitesAction(): Promise<{
  ok: boolean;
  invites?: PendingInviteListItem[];
  error?: string;
}> {
  try {
    await assertCallerIsAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const admin = getServiceRoleClient();
  const now = new Date();
  const { data, error } = await admin
    .from('pending_invites')
    .select('id, email, full_name_hint, invited_at, token_expires_at, invited_by')
    .eq('is_agency_admin', true)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  // Lookup emails de los invitantes.
  const inviterIds = Array.from(new Set((data ?? []).map((r) => r.invited_by).filter(Boolean)));
  let inviterEmails: Record<string, string> = {};
  if (inviterIds.length > 0) {
    const { data: inviters } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', inviterIds);
    if (inviters) {
      inviterEmails = Object.fromEntries(inviters.map((p) => [p.id, p.email]));
    }
  }

  const items: PendingInviteListItem[] = (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name_hint: r.full_name_hint,
    invited_by_email: inviterEmails[r.invited_by] ?? null,
    invited_at: r.invited_at,
    token_expires_at: r.token_expires_at,
    is_expired: new Date(r.token_expires_at) < now,
  }));

  return { ok: true, invites: items };
}

/**
 * Invita a un nuevo agency admin. Wrapper de inviteUserAction con isAgencyAdmin=true.
 */
export async function inviteAdminAction(
  email: string,
  fullNameHint?: string,
): Promise<InviteActionResult> {
  return inviteUserAction({
    email,
    role: 'admin',
    fullNameHint,
    tenantId: null,
    isAgencyAdmin: true,
  });
}

/**
 * Desactiva (no borra) un agency admin. Pierde acceso a /admin/* y a su tenant.
 * No se puede auto-desactivar para evitar lockout completo.
 */
export async function revokeAdminAction(profileId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  let caller;
  try {
    caller = await assertCallerIsAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (caller.id === profileId) {
    return { ok: false, error: 'No puedes desactivar tu propia cuenta.' };
  }

  const admin = getServiceRoleClient();
  const { data: target } = await admin
    .from('profiles')
    .select('id, email, tenant_id, is_agency_admin, is_active')
    .eq('id', profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Admin no encontrado.' };
  if (target.is_agency_admin !== true) {
    return { ok: false, error: 'El usuario no es agency admin.' };
  }

  const { error } = await admin
    .from('profiles')
    .update({ is_active: false })
    .eq('id', profileId);
  if (error) return { ok: false, error: error.message };

  await admin.from('tenant_audit_log').insert({
    tenant_id: target.tenant_id,
    actor_user_id: caller.id,
    actor_email: caller.email,
    action: 'admin.revoked',
    target_user_id: profileId,
    target_email: target.email,
    metadata: {},
  });

  revalidatePath('/admin/admins');
  return { ok: true };
}

/**
 * Reactiva un admin previamente desactivado.
 */
export async function reactivateAdminAction(profileId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  let caller;
  try {
    caller = await assertCallerIsAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const admin = getServiceRoleClient();
  const { data: target } = await admin
    .from('profiles')
    .select('id, email, tenant_id, is_agency_admin, is_active')
    .eq('id', profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Admin no encontrado.' };
  if (target.is_agency_admin !== true) {
    return { ok: false, error: 'El usuario no es agency admin.' };
  }
  if (target.is_active === true) return { ok: true }; // idempotente

  const { error } = await admin
    .from('profiles')
    .update({ is_active: true })
    .eq('id', profileId);
  if (error) return { ok: false, error: error.message };

  await admin.from('tenant_audit_log').insert({
    tenant_id: target.tenant_id,
    actor_user_id: caller.id,
    actor_email: caller.email,
    action: 'admin.reactivated',
    target_user_id: profileId,
    target_email: target.email,
    metadata: {},
  });

  revalidatePath('/admin/admins');
  return { ok: true };
}

// Nota: `'use server'` files SOLO pueden exportar async functions. Los re-exports
// de tipos rompen la build de Next.js. Los UI components importan `revokeInviteAction`
// y `resendInviteEmailAction` directamente desde `./invites`.
