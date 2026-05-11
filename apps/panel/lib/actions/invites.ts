'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { sendEmail } from '@/lib/email';
import {
  renderInviteEmailHtml,
  renderInviteEmailSubject,
  type InviteEmailVars,
} from '@/lib/email/templates/invite';

/**
 * Server actions de invitaciones (Hito 10).
 *
 *  - `inviteUserAction`: agency admin o tenant owner crea invite (token + email Resend).
 *  - `acceptInviteAction`: público, sin auth. Token válido → crea auth user + profile
 *    + marca accepted_at + auto-login + redirect dashboard.
 *  - `revokeInviteAction`: agency admin o tenant owner cancela invite pendiente.
 *  - `resendInviteEmailAction`: reenvía email a un invite ya creado (no cambia token).
 *
 * Audit trail vía `tenant_audit_log`: invite.created, invite.accepted, invite.revoked, invite.resent.
 *
 * RLS de `pending_invites` solo permite SELECT desde cliente normal. INSERT/UPDATE
 * los hacemos siempre con service_role tras chequear permisos manualmente en el server action.
 */

export type InviteActionResult =
  | { ok: true; inviteId: number; tokenSuffix: string }
  | { ok: false; error: string };

export type AcceptInviteResult =
  | { ok: true }
  | { ok: false; error: string };

export type RevokeInviteResult =
  | { ok: true }
  | { ok: false; error: string };

const TOKEN_BYTES = 32; // 64 hex chars
const MIN_PASSWORD_LENGTH = 10;
const TOKEN_TTL_DAYS = 7;

interface InviteInput {
  email: string;
  /** owner | admin | viewer. Ignorado si isAgencyAdmin=true (admin queda hardcoded). */
  role: 'owner' | 'admin' | 'viewer';
  fullNameHint?: string;
  /** null si isAgencyAdmin=true. */
  tenantId: number | null;
  isAgencyAdmin: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function panelOrigin(): string {
  return (
    process.env.PANEL_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_PANEL_ORIGIN ??
    'http://localhost:3000'
  );
}

function formatExpiresLabel(expiresAt: Date): string {
  try {
    return expiresAt.toLocaleString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid',
    });
  } catch {
    return expiresAt.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function roleLabel(role: 'owner' | 'admin' | 'viewer', isAgencyAdmin: boolean): string {
  if (isAgencyAdmin) return 'Admin Fyzon';
  if (role === 'owner') return 'Owner del tenant';
  if (role === 'admin') return 'Colaborador';
  return 'Viewer';
}

/**
 * Comprueba que el caller pueda crear el invite indicado:
 *  - Si isAgencyAdmin=true → caller DEBE ser agency_admin activo.
 *  - Si tenantId != null → caller DEBE ser agency_admin activo OR owner activo de ese tenantId.
 */
async function assertCallerCanInvite(input: InviteInput): Promise<{
  ok: true;
  callerId: string;
  callerEmail: string;
  callerTenantId: number;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, role, is_agency_admin, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) throw new Error('forbidden');

  if (input.isAgencyAdmin && !profile.is_agency_admin) {
    throw new Error('forbidden — solo agency admins pueden invitar a otros admins');
  }

  if (!input.isAgencyAdmin) {
    if (input.tenantId == null) {
      throw new Error('invalid — tenantId requerido para invite no-admin');
    }
    const canForTenant =
      profile.is_agency_admin === true ||
      (profile.tenant_id === input.tenantId && profile.role === 'owner');
    if (!canForTenant) {
      throw new Error('forbidden — no eres owner ni admin de ese tenant');
    }
  }

  return {
    ok: true,
    callerId: profile.id,
    callerEmail: profile.email,
    callerTenantId: profile.tenant_id,
  };
}

/**
 * Crea una invitación y envía email. Devuelve resultado tipado (sin tirar excepciones
 * para UI). Si el envío de email falla, el invite QUEDA creado en BD para reintento manual.
 */
export async function inviteUserAction(input: InviteInput): Promise<InviteActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'Email inválido.' };

  let caller;
  try {
    caller = await assertCallerCanInvite(input);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const admin = getServiceRoleClient();

  // 1) Verificar que no exista ya un profile con ese email en el tenant target
  //    (o en cualquier tenant si es agency_admin).
  const existingProfileQuery = admin
    .from('profiles')
    .select('id, tenant_id, is_active, is_agency_admin')
    .eq('email', email);
  const { data: existingProfiles } = await existingProfileQuery;

  if (existingProfiles && existingProfiles.length > 0) {
    if (input.isAgencyAdmin) {
      const conflict = existingProfiles.find((p) => p.is_agency_admin === true);
      if (conflict) {
        return { ok: false, error: 'Ya existe un usuario admin con ese email.' };
      }
    } else if (input.tenantId != null) {
      const conflict = existingProfiles.find((p) => p.tenant_id === input.tenantId);
      if (conflict) {
        return { ok: false, error: 'Ya existe un usuario con ese email en este tenant.' };
      }
    }
  }

  // 2) Verificar no haya invite activo equivalente.
  let pendingQuery = admin
    .from('pending_invites')
    .select('id')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('token_expires_at', new Date().toISOString())
    .eq('email', email);

  if (input.isAgencyAdmin) {
    pendingQuery = pendingQuery.eq('is_agency_admin', true);
  } else if (input.tenantId != null) {
    pendingQuery = pendingQuery.eq('tenant_id', input.tenantId).eq('is_agency_admin', false);
  }
  const { data: existingPending } = await pendingQuery.maybeSingle();
  if (existingPending) {
    return {
      ok: false,
      error: 'Ya hay una invitación activa para ese email. Cancélala antes de reinvitar.',
    };
  }

  // 3) Crear invite.
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { data: inserted, error: insertError } = await admin
    .from('pending_invites')
    .insert({
      email,
      tenant_id: input.isAgencyAdmin ? null : input.tenantId,
      role: input.isAgencyAdmin ? 'admin' : input.role,
      is_agency_admin: input.isAgencyAdmin,
      invited_by: caller.callerId,
      token,
      token_expires_at: expiresAt.toISOString(),
      full_name_hint: input.fullNameHint?.trim() || null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: `BD: ${insertError?.message ?? 'INSERT falló'}` };
  }

  // 4) Audit log.
  await admin.from('tenant_audit_log').insert({
    tenant_id: input.isAgencyAdmin ? caller.callerTenantId : input.tenantId!,
    actor_user_id: caller.callerId,
    actor_email: caller.callerEmail,
    action: 'invite.created',
    target_email: email,
    metadata: {
      invite_id: inserted.id,
      is_agency_admin: input.isAgencyAdmin,
      role: input.isAgencyAdmin ? 'admin' : input.role,
      expires_at: expiresAt.toISOString(),
    },
  });

  // 5) Email (best effort — si falla, el invite ya está en BD).
  const contextLabel = await resolveContextLabel(admin, input);
  const emailVars: InviteEmailVars = {
    fullNameHint: input.fullNameHint?.trim() ?? '',
    contextLabel,
    roleLabel: roleLabel(input.isAgencyAdmin ? 'admin' : input.role, input.isAgencyAdmin),
    acceptUrl: `${panelOrigin()}/accept-invite?token=${token}`,
    expiresAtLabel: formatExpiresLabel(expiresAt),
  };
  const emailResult = await sendEmail({
    to: email,
    subject: renderInviteEmailSubject(emailVars),
    html: renderInviteEmailHtml(emailVars),
  });

  if (!emailResult.ok) {
    // No fallar la action — el invite está creado. El admin puede reenviar después.
    console.warn('[inviteUserAction] email failed', { inviteId: inserted.id, error: emailResult.error });
  }

  // 6) Revalidar caches relevantes.
  if (input.isAgencyAdmin) {
    revalidatePath('/admin/admins');
  } else if (input.tenantId != null) {
    revalidatePath(`/admin/tenants/${input.tenantId}`);
  }

  return {
    ok: true,
    inviteId: inserted.id,
    tokenSuffix: token.slice(-8),
  };
}

async function resolveContextLabel(
  admin: ReturnType<typeof getServiceRoleClient>,
  input: InviteInput,
): Promise<string> {
  if (input.isAgencyAdmin) return 'Fyzon Setters Agency';
  if (input.tenantId == null) return 'Fyzon Setters';
  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', input.tenantId)
    .maybeSingle();
  return tenant?.name ?? `Tenant #${input.tenantId}`;
}

/**
 * Acepta una invitación. Action PÚBLICA — sin auth.
 *
 *  - Lookup pending_invite por token (activo, no expirado).
 *  - Crea auth.users via service_role.admin.createUser.
 *  - Crea profile con tenant_id + role + is_agency_admin del invite.
 *  - Marca invite.accepted_at.
 *  - Auto-login (signInWithPassword desde el server client del request).
 *  - Redirect dashboard correspondiente (next/navigation redirect throws).
 *
 * Si hay race condition (otro accept simultáneo) → error claro al user.
 */
export async function acceptInviteAction(
  _prev: { status: 'idle' | 'error'; message: string },
  formData: FormData,
): Promise<{ status: 'idle' | 'error'; message: string }> {
  const token = String(formData.get('token') ?? '').trim();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const passwordConfirm = String(formData.get('password_confirm') ?? '');

  if (!token) return { status: 'error', message: 'Token de invitación faltante.' };
  if (!fullName) return { status: 'error', message: 'Indica tu nombre completo.' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'error',
      message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (password !== passwordConfirm) {
    return { status: 'error', message: 'Las contraseñas no coinciden.' };
  }

  const admin = getServiceRoleClient();

  // 1) Lookup invite.
  const { data: invite } = await admin
    .from('pending_invites')
    .select('id, email, tenant_id, role, is_agency_admin, full_name_hint, token_expires_at, accepted_at, revoked_at, invited_by')
    .eq('token', token)
    .maybeSingle();

  if (!invite) {
    return { status: 'error', message: 'Invitación inválida o ya usada.' };
  }
  if (invite.accepted_at) {
    return { status: 'error', message: 'Esta invitación ya fue aceptada.' };
  }
  if (invite.revoked_at) {
    return { status: 'error', message: 'Esta invitación fue cancelada.' };
  }
  if (new Date(invite.token_expires_at) < new Date()) {
    return { status: 'error', message: 'Esta invitación ha caducado. Pide una nueva.' };
  }

  // 2) Crear user en auth.users (con email_confirm=true para saltar verificación).
  const { data: createResult, error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !createResult?.user) {
    const msg = createError?.message ?? '';
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return {
        status: 'error',
        message: 'Ya existe una cuenta con este email. Usa "¿Olvidaste contraseña?" en /login.',
      };
    }
    return { status: 'error', message: `No pudimos crear la cuenta: ${msg || 'desconocido'}` };
  }

  const newUserId = createResult.user.id;

  // 3) Crear profile.
  const profileRow: {
    id: string;
    tenant_id: number;
    email: string;
    full_name: string;
    role: 'owner' | 'admin' | 'viewer';
    is_agency_admin: boolean;
    invited_by: string | null;
    invited_at: string;
    is_active: boolean;
  } = {
    id: newUserId,
    tenant_id: invite.tenant_id ?? 1, // agency admin se asigna al tenant Fyzon (id=1) por convención
    email: invite.email,
    full_name: fullName,
    role: invite.role,
    is_agency_admin: invite.is_agency_admin,
    invited_by: invite.invited_by,
    invited_at: new Date().toISOString(),
    is_active: true,
  };
  const { error: profileError } = await admin.from('profiles').insert(profileRow);
  if (profileError) {
    // Rollback parcial: borrar el auth user creado para evitar zombies.
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch {
      // best effort
    }
    return { status: 'error', message: `BD profile: ${profileError.message}` };
  }

  // 4) Marcar invite accepted.
  await admin
    .from('pending_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  // 5) Audit log.
  await admin.from('tenant_audit_log').insert({
    tenant_id: invite.tenant_id ?? 1,
    actor_user_id: newUserId,
    actor_email: invite.email,
    action: 'invite.accepted',
    target_user_id: newUserId,
    target_email: invite.email,
    metadata: {
      invite_id: invite.id,
      is_agency_admin: invite.is_agency_admin,
      role: invite.role,
    },
  });

  // 6) Auto-login (set cookie sesión vía cliente SSR).
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email: invite.email, password });

  // 7) Redirect.
  redirect(invite.is_agency_admin ? '/admin/dashboard' : '/dashboard');
}

/**
 * Cancela un invite pendiente.
 */
export async function revokeInviteAction(inviteId: number): Promise<RevokeInviteResult> {
  if (!Number.isFinite(inviteId) || inviteId <= 0) {
    return { ok: false, error: 'inviteId inválido' };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, role, is_agency_admin, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) {
    return { ok: false, error: 'forbidden' };
  }

  const admin = getServiceRoleClient();
  const { data: invite } = await admin
    .from('pending_invites')
    .select('id, email, tenant_id, is_agency_admin, accepted_at, revoked_at')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: 'Invitación no encontrada.' };
  if (invite.accepted_at) return { ok: false, error: 'Ya aceptada, no se puede revocar.' };
  if (invite.revoked_at) return { ok: false, error: 'Ya revocada.' };

  // Permisos: agency admin (siempre) o owner del tenant target (si invite no es admin).
  const canRevoke =
    profile.is_agency_admin === true ||
    (invite.is_agency_admin === false &&
      profile.tenant_id === invite.tenant_id &&
      profile.role === 'owner');
  if (!canRevoke) return { ok: false, error: 'forbidden' };

  const { error } = await admin
    .from('pending_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) return { ok: false, error: error.message };

  await admin.from('tenant_audit_log').insert({
    tenant_id: invite.tenant_id ?? profile.tenant_id,
    actor_user_id: profile.id,
    actor_email: profile.email,
    action: 'invite.revoked',
    target_email: invite.email,
    metadata: { invite_id: inviteId },
  });

  if (invite.is_agency_admin) {
    revalidatePath('/admin/admins');
  } else if (invite.tenant_id != null) {
    revalidatePath(`/admin/tenants/${invite.tenant_id}`);
  }

  return { ok: true };
}

/**
 * Reenvía el email del invite (mismo token, no se rota).
 */
export async function resendInviteEmailAction(inviteId: number): Promise<RevokeInviteResult> {
  if (!Number.isFinite(inviteId) || inviteId <= 0) {
    return { ok: false, error: 'inviteId inválido' };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, tenant_id, role, is_agency_admin, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) return { ok: false, error: 'forbidden' };

  const admin = getServiceRoleClient();
  const { data: invite } = await admin
    .from('pending_invites')
    .select('id, email, tenant_id, role, is_agency_admin, token, token_expires_at, accepted_at, revoked_at, full_name_hint')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: 'Invitación no encontrada.' };
  if (invite.accepted_at || invite.revoked_at) {
    return { ok: false, error: 'Invitación ya no activa.' };
  }
  if (new Date(invite.token_expires_at) < new Date()) {
    return { ok: false, error: 'Invitación caducada — cancélala y crea una nueva.' };
  }

  const canResend =
    profile.is_agency_admin === true ||
    (invite.is_agency_admin === false &&
      profile.tenant_id === invite.tenant_id &&
      profile.role === 'owner');
  if (!canResend) return { ok: false, error: 'forbidden' };

  const contextLabel = await resolveContextLabel(admin, {
    email: invite.email,
    role: invite.role as 'owner' | 'admin' | 'viewer',
    tenantId: invite.tenant_id,
    isAgencyAdmin: invite.is_agency_admin,
  });
  const emailVars: InviteEmailVars = {
    fullNameHint: invite.full_name_hint ?? '',
    contextLabel,
    roleLabel: roleLabel(invite.role as 'owner' | 'admin' | 'viewer', invite.is_agency_admin),
    acceptUrl: `${panelOrigin()}/accept-invite?token=${invite.token}`,
    expiresAtLabel: formatExpiresLabel(new Date(invite.token_expires_at)),
  };
  const result = await sendEmail({
    to: invite.email,
    subject: renderInviteEmailSubject(emailVars),
    html: renderInviteEmailHtml(emailVars),
  });
  if (!result.ok) return { ok: false, error: `Email: ${result.error}` };

  await admin.from('tenant_audit_log').insert({
    tenant_id: invite.tenant_id ?? profile.tenant_id,
    actor_user_id: profile.id,
    actor_email: profile.email,
    action: 'invite.resent',
    target_email: invite.email,
    metadata: { invite_id: inviteId },
  });

  return { ok: true };
}
