'use server';

import { revalidatePath } from 'next/cache';
import {
  AuthError,
  requireTenantRoleAtLeast,
  type TenantRole,
} from '@/lib/auth/require-tenant-role';
import { logAuditEvent } from '@/lib/auth/audit-log';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface MemberRow {
  userId: string;
  email: string;
  fullName: string | null;
  role: TenantRole;
  isActive: boolean;
  isAgencyAdmin: boolean;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
  createdAt: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(err: AuthError): string {
  switch (err.code) {
    case 'UNAUTHENTICATED':
      return 'No estás autenticado.';
    case 'PROFILE_NOT_FOUND':
      return 'Tu perfil no existe en la base de datos.';
    case 'PROFILE_INACTIVE':
      return 'Tu cuenta está desactivada.';
    case 'FORBIDDEN_WRONG_TENANT':
      return 'No tienes permisos sobre esta sub-cuenta.';
    case 'FORBIDDEN_ROLE_REQUIRED':
      return `Acción restringida a rol ${err.required ?? 'owner'}.`;
    case 'FORBIDDEN_AGENCY_ADMIN_REQUIRED':
      return 'Acción restringida a administrador de agencia.';
    default:
      return 'No autorizado.';
  }
}

function handleAuthOrError(err: unknown): { ok: false; error: string } {
  if (err instanceof AuthError) return { ok: false, error: authErrorMessage(err) };
  return { ok: false, error: (err as Error).message ?? 'error desconocido' };
}

// ---------------------------------------------------------------------------
// listMembers — agency admin O cualquier role del tenant pueden listar.
// ---------------------------------------------------------------------------

export async function listMembers(args: {
  tenantId: number;
}): Promise<ActionResult<MemberRow[]>> {
  try {
    await requireTenantRoleAtLeast({ tenantId: args.tenantId, minRole: 'viewer' });
  } catch (err) {
    return handleAuthOrError(err);
  }

  try {
    const supabase = getServiceRoleClient();

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(
        'id, email, full_name, role, is_active, is_agency_admin, invited_at, created_at',
      )
      .eq('tenant_id', args.tenantId)
      .order('created_at', { ascending: true });

    if (error) return { ok: false, error: error.message };

    const userIds = (profiles ?? []).map((p) => String(p.id));
    const confirmedMap = new Map<string, string | null>();

    // Cargar email_confirmed_at de auth.users (admin API). Mejor esfuerzo —
    // si falla, dejamos pendientes como `null`.
    if (userIds.length > 0) {
      try {
        for (const uid of userIds) {
          const { data: u } = await supabase.auth.admin.getUserById(uid);
          confirmedMap.set(uid, u?.user?.email_confirmed_at ?? null);
        }
      } catch {
        // best-effort
      }
    }

    const rows: MemberRow[] = (profiles ?? []).map((p) => ({
      userId: String(p.id),
      email: String(p.email),
      fullName: p.full_name as string | null,
      role: (p.role ?? 'owner') as TenantRole,
      isActive: Boolean(p.is_active),
      isAgencyAdmin: Boolean(p.is_agency_admin),
      invitedAt: p.invited_at as string | null,
      emailConfirmedAt: confirmedMap.get(String(p.id)) ?? null,
      createdAt: String(p.created_at),
    }));

    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// inviteMember — owner del tenant O agency admin.
// ---------------------------------------------------------------------------

const ALLOWED_INVITE_ROLES: TenantRole[] = ['owner', 'admin', 'viewer'];

export async function inviteMember(args: {
  tenantId: number;
  email: string;
  role: TenantRole;
}): Promise<ActionResult<{ userId: string; sent: boolean }>> {
  let actor;
  try {
    actor = await requireTenantRoleAtLeast({
      tenantId: args.tenantId,
      minRole: 'owner',
    });
  } catch (err) {
    return handleAuthOrError(err);
  }

  const email = args.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, error: 'Email no válido.' };
  }
  if (!ALLOWED_INVITE_ROLES.includes(args.role)) {
    return { ok: false, error: 'Rol no válido.' };
  }

  const supabase = getServiceRoleClient();

  // ¿Ya existe un profile para este email en este tenant? Idempotencia.
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, is_active')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile && Number(existingProfile.tenant_id) === args.tenantId) {
    if (existingProfile.is_active) {
      return { ok: false, error: 'Ya hay un miembro con ese email en esta sub-cuenta.' };
    }
    // Reactivar miembro que estaba soft-removed.
    const { error: reactivateError } = await supabase
      .from('profiles')
      .update({
        is_active: true,
        role: args.role,
        invited_by: actor.userId,
        invited_at: new Date().toISOString(),
      })
      .eq('id', existingProfile.id);
    if (reactivateError) return { ok: false, error: reactivateError.message };

    await logAuditEvent({
      tenantId: args.tenantId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'member.reactivated',
      targetUserId: String(existingProfile.id),
      targetEmail: email,
      metadata: { role: args.role },
    });
    revalidatePath(`/admin/tenants/${args.tenantId}/members`);
    revalidatePath('/settings/members');
    return { ok: true, data: { userId: String(existingProfile.id), sent: false } };
  }

  if (existingProfile && Number(existingProfile.tenant_id) !== args.tenantId) {
    return {
      ok: false,
      error: 'Este email pertenece a otra sub-cuenta. Quítalo de allá primero.',
    };
  }

  // No existe profile — usar Supabase admin invite (crea auth.users + envía email).
  // Hito 11 fix: usar PANEL_PUBLIC_URL canónico (antes fallback localhost en prod).
  // Los invitados de tenant siempre van a panel.fyzon.es (no admin.fyzon.es).
  const baseUrl =
    process.env.PANEL_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_PANEL_BASE_URL ??
    process.env.NEXT_PUBLIC_PANEL_ORIGIN ??
    'http://localhost:3000';
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        tenant_id: args.tenantId,
        role: args.role,
        invited_by: actor.userId,
      },
      redirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
    },
  );

  if (inviteError || !invited.user) {
    return {
      ok: false,
      error: inviteError?.message ?? 'No se pudo enviar la invitación.',
    };
  }

  // INSERT profile asociado.
  const { error: insertError } = await supabase.from('profiles').insert({
    id: invited.user.id,
    tenant_id: args.tenantId,
    email,
    role: args.role,
    is_active: true,
    is_agency_admin: false,
    invited_by: actor.userId,
    invited_at: new Date().toISOString(),
  });

  if (insertError) {
    return { ok: false, error: `Auth user creado pero profile falló: ${insertError.message}` };
  }

  await logAuditEvent({
    tenantId: args.tenantId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'member.invited',
    targetUserId: invited.user.id,
    targetEmail: email,
    metadata: { role: args.role },
  });

  revalidatePath(`/admin/tenants/${args.tenantId}/members`);
  revalidatePath('/settings/members');
  return { ok: true, data: { userId: invited.user.id, sent: true } };
}

// ---------------------------------------------------------------------------
// resetMemberPassword — owner del tenant O agency admin.
// ---------------------------------------------------------------------------

export async function resetMemberPassword(args: {
  tenantId: number;
  userId: string;
}): Promise<ActionResult> {
  let actor;
  try {
    actor = await requireTenantRoleAtLeast({
      tenantId: args.tenantId,
      minRole: 'owner',
    });
  } catch (err) {
    return handleAuthOrError(err);
  }

  const supabase = getServiceRoleClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id')
    .eq('id', args.userId)
    .maybeSingle();

  if (!profile) return { ok: false, error: 'Miembro no encontrado.' };
  if (Number(profile.tenant_id) !== args.tenantId) {
    return { ok: false, error: 'Miembro no pertenece a esta sub-cuenta.' };
  }

  // Genera link de recovery (Supabase enviará el email).
  const baseUrl = process.env.NEXT_PUBLIC_PANEL_BASE_URL ?? 'http://localhost:3000';
  const { error } = await supabase.auth.resetPasswordForEmail(String(profile.email), {
    redirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
  });

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    tenantId: args.tenantId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'member.password_reset',
    targetUserId: String(profile.id),
    targetEmail: String(profile.email),
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// changeMemberRole — owner del tenant O agency admin.
// ---------------------------------------------------------------------------

export async function changeMemberRole(args: {
  tenantId: number;
  userId: string;
  newRole: TenantRole;
}): Promise<ActionResult> {
  let actor;
  try {
    actor = await requireTenantRoleAtLeast({
      tenantId: args.tenantId,
      minRole: 'owner',
    });
  } catch (err) {
    return handleAuthOrError(err);
  }

  if (!ALLOWED_INVITE_ROLES.includes(args.newRole)) {
    return { ok: false, error: 'Rol no válido.' };
  }

  const supabase = getServiceRoleClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, role')
    .eq('id', args.userId)
    .maybeSingle();

  if (!profile) return { ok: false, error: 'Miembro no encontrado.' };
  if (Number(profile.tenant_id) !== args.tenantId) {
    return { ok: false, error: 'Miembro no pertenece a esta sub-cuenta.' };
  }

  const oldRole = profile.role as TenantRole;
  if (oldRole === args.newRole) return { ok: true };

  const { error } = await supabase
    .from('profiles')
    .update({ role: args.newRole })
    .eq('id', args.userId);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    tenantId: args.tenantId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'member.role_changed',
    targetUserId: String(profile.id),
    targetEmail: String(profile.email),
    metadata: { from: oldRole, to: args.newRole },
  });

  revalidatePath(`/admin/tenants/${args.tenantId}/members`);
  revalidatePath('/settings/members');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// removeMember — owner del tenant O agency admin. Soft remove (is_active=false).
// ---------------------------------------------------------------------------

export async function removeMember(args: {
  tenantId: number;
  userId: string;
}): Promise<ActionResult> {
  let actor;
  try {
    actor = await requireTenantRoleAtLeast({
      tenantId: args.tenantId,
      minRole: 'owner',
    });
  } catch (err) {
    return handleAuthOrError(err);
  }

  if (actor.userId === args.userId) {
    return { ok: false, error: 'No puedes quitarte a ti mismo.' };
  }

  const supabase = getServiceRoleClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, role, is_agency_admin')
    .eq('id', args.userId)
    .maybeSingle();

  if (!profile) return { ok: false, error: 'Miembro no encontrado.' };
  if (Number(profile.tenant_id) !== args.tenantId) {
    return { ok: false, error: 'Miembro no pertenece a esta sub-cuenta.' };
  }
  if (profile.is_agency_admin) {
    return { ok: false, error: 'No se puede quitar a un agency admin.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', args.userId);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    tenantId: args.tenantId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'member.removed',
    targetUserId: String(profile.id),
    targetEmail: String(profile.email),
    metadata: { role: profile.role },
  });

  revalidatePath(`/admin/tenants/${args.tenantId}/members`);
  revalidatePath('/settings/members');
  return { ok: true };
}
