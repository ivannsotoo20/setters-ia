'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAgencyAdmin } from '@/lib/auth/require-agency-admin';
import { inviteUserAction } from './invites';

/**
 * Server actions de gestión de tenants (Sprint Crear Sub-cuenta).
 *
 *   - `provisionTenantAction(input)`: orquesta la creación de un tenant nuevo
 *      desde /admin/tenants/new. Llama a la función Postgres `provision_tenant`
 *      (migration 043) que es atómica + dispara los triggers existentes
 *      (labels, widgets, followup_config). Luego envía invitación al owner
 *      vía `inviteUserAction(flavor='new_tenant_owner')` (best-effort: si el
 *      email falla, el tenant queda creado y el admin reenvía después).
 *   - `checkSlugAvailabilityAction(slug)` y `checkEmailAvailabilityAction(email)`:
 *      consultas read-only para UI live (debounced).
 *   - `markOnboardingCompleteAction()`: el trainer marca su wizard completo →
 *      setea `tenants.onboarded_at = NOW()`.
 *
 * Cuota soft anti-abuso: 20 tenants creados / 24h por admin (configurable env).
 *
 * Errores tipificados con `field` para resaltar el input correspondiente en UI.
 */

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TENANTS_PER_ADMIN_PER_DAY = Number(
  process.env.MAX_TENANTS_PER_ADMIN_PER_DAY ?? '20',
);

const RESERVED_SLUGS = new Set<string>([
  'admin','api','app','panel','fyzon','www','dashboard',
  'login','accept-invite','auth','signup','onboarding',
  'conversations','contacts','pipeline','settings','keywords',
  'labels','webhook','webhooks','health','public','static',
  'motor','setter','setters','vercel',
]);

const ALLOWED_TIMEZONES = new Set<string>([
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/London',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Caracas',
  'UTC',
]);

// ----- Tipos públicos --------------------------------------------------------

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  trainerEmail: string;
  trainerFullName: string;
  timezone?: string;
  internalNotes?: string | null;
}

export interface ProvisionedTokens {
  ycloud_webhook?: string;
  ghl_webhook?: string;
  lead_form_webhook?: string;
}

export type ProvisionTenantResult =
  | {
      ok: true;
      tenantId: number;
      slug: string;
      inviteId: number | null;
      emailSent: boolean;
      tokens: ProvisionedTokens;
      /** True si el invite falló (email Resend KO o tenant creado pero usuario no invitado). */
      inviteWarning?: string;
    }
  | {
      ok: false;
      error: string;
      field?: 'name' | 'slug' | 'trainerEmail' | 'trainerFullName' | 'timezone' | 'internalNotes';
    };

export type SlugAvailability =
  | { state: 'invalid' }
  | { state: 'reserved' }
  | { state: 'taken' }
  | { state: 'available' };

export type EmailAvailability =
  | { state: 'invalid' }
  | { state: 'pending_invite'; tenantId: number | null; tenantName: string | null }
  | { state: 'profile_exists'; tenantId: number | null; tenantName: string | null }
  | { state: 'ok' };

// ----- Helpers ---------------------------------------------------------------

function sanitizeString(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, max);
}

function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// La utilidad slugify vive en el cliente (create-tenant-form.tsx) — el servidor
// solo valida con SLUG_REGEX. Mantener ambos en sintonía manualmente.

// ----- checkSlugAvailabilityAction ------------------------------------------

export async function checkSlugAvailabilityAction(
  slug: string,
): Promise<SlugAvailability> {
  try {
    await requireAgencyAdmin();
  } catch {
    return { state: 'invalid' };
  }
  const normalized = sanitizeString(slug, 50).toLowerCase();
  if (!SLUG_REGEX.test(normalized)) return { state: 'invalid' };
  if (isReservedSlug(normalized)) return { state: 'reserved' };

  const admin = getServiceRoleClient();
  const { data } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', normalized)
    .maybeSingle();
  if (data) return { state: 'taken' };
  return { state: 'available' };
}

// ----- checkEmailAvailabilityAction -----------------------------------------

export async function checkEmailAvailabilityAction(
  email: string,
): Promise<EmailAvailability> {
  try {
    await requireAgencyAdmin();
  } catch {
    return { state: 'invalid' };
  }
  const normalized = sanitizeString(email, 254).toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) return { state: 'invalid' };

  const admin = getServiceRoleClient();

  // Profile activo con ese email — bloqueante (no se puede crear tenant 2 con
  // mismo email owner en otro tenant).
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, tenant_id, is_active, is_agency_admin')
    .eq('email', normalized);

  if (profiles && profiles.length > 0) {
    const active = profiles.find((p) => p.is_active);
    if (active) {
      const { data: tenant } = await admin
        .from('tenants')
        .select('id, name')
        .eq('id', active.tenant_id)
        .maybeSingle();
      return {
        state: 'profile_exists',
        tenantId: Number(active.tenant_id),
        tenantName: tenant?.name ?? null,
      };
    }
  }

  // Invite activo pendiente.
  const { data: pending } = await admin
    .from('pending_invites')
    .select('id, tenant_id')
    .eq('email', normalized)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('token_expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    let tenantName: string | null = null;
    if (pending.tenant_id != null) {
      const { data: tenant } = await admin
        .from('tenants')
        .select('name')
        .eq('id', pending.tenant_id)
        .maybeSingle();
      tenantName = tenant?.name ?? null;
    }
    return {
      state: 'pending_invite',
      tenantId: pending.tenant_id ?? null,
      tenantName,
    };
  }

  return { state: 'ok' };
}

// ----- provisionTenantAction -------------------------------------------------

export async function provisionTenantAction(
  raw: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  // 1. Auth.
  let caller;
  try {
    caller = await requireAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // 2. Validación de input.
  const name = sanitizeString(raw.name, 80);
  const slug = sanitizeString(raw.slug, 50).toLowerCase();
  const trainerEmail = sanitizeString(raw.trainerEmail, 254).toLowerCase();
  const trainerFullName = sanitizeString(raw.trainerFullName, 80);
  const timezone = sanitizeString(raw.timezone ?? 'Europe/Madrid', 64) || 'Europe/Madrid';
  const internalNotes = sanitizeString(raw.internalNotes ?? '', 2000);

  if (name.length < 2) {
    return { ok: false, error: 'El nombre del negocio debe tener al menos 2 caracteres.', field: 'name' };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      error: 'Slug inválido. Debe ser kebab-case (a-z, 0-9, guiones), 3-40 chars, sin guiones al inicio o final.',
      field: 'slug',
    };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, error: 'Ese slug está reservado. Elige otro.', field: 'slug' };
  }
  if (!EMAIL_REGEX.test(trainerEmail)) {
    return { ok: false, error: 'Email inválido.', field: 'trainerEmail' };
  }
  if (trainerFullName.length < 2) {
    return {
      ok: false,
      error: 'Indica el nombre completo del trainer.',
      field: 'trainerFullName',
    };
  }
  if (!ALLOWED_TIMEZONES.has(timezone)) {
    return { ok: false, error: 'Zona horaria no soportada.', field: 'timezone' };
  }

  const admin = getServiceRoleClient();

  // 3. Cuota soft anti-abuso (no bloquea creación si la consulta falla).
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('tenant_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', caller.userId)
      .eq('action', 'tenant.created')
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_TENANTS_PER_ADMIN_PER_DAY) {
      return {
        ok: false,
        error: `Cuota diaria alcanzada (${MAX_TENANTS_PER_ADMIN_PER_DAY} tenants/24h). Espera o sube MAX_TENANTS_PER_ADMIN_PER_DAY.`,
      };
    }
  } catch (err) {
    console.warn('[provisionTenantAction] cuota check skipped', { err: (err as Error).message });
  }

  // 4. Pre-check email (early-fail UX). El RPC no chequea esto.
  try {
    const emailAvail = await checkEmailAvailabilityAction(trainerEmail);
    if (emailAvail.state === 'profile_exists') {
      return {
        ok: false,
        error: `Ya existe un usuario activo con este email en "${emailAvail.tenantName ?? 'otro tenant'}". Quítalo de allá antes de reinvitarlo.`,
        field: 'trainerEmail',
      };
    }
    if (emailAvail.state === 'pending_invite') {
      return {
        ok: false,
        error: `Ya hay una invitación activa para este email en "${emailAvail.tenantName ?? 'otro tenant'}". Cancélala antes de reinvitar.`,
        field: 'trainerEmail',
      };
    }
  } catch (err) {
    console.warn('[provisionTenantAction] email check skipped', { err: (err as Error).message });
  }

  // 5. RPC atómica provision_tenant.
  const { data: rpcData, error: rpcError } = await admin.rpc('provision_tenant', {
    p_slug: slug,
    p_name: name,
    p_timezone: timezone,
    p_created_by: caller.userId,
    p_created_by_email: caller.email,
    p_internal_notes: internalNotes.length > 0 ? internalNotes : null,
  });

  if (rpcError) {
    const code = (rpcError as { code?: string }).code;
    const msg = rpcError.message ?? '';
    if (code === '23505' || msg.toLowerCase().includes('unique')) {
      return { ok: false, error: 'Ese slug ya está en uso. Elige otro.', field: 'slug' };
    }
    if (code === '22023' || msg.includes('invalid_slug_format') || msg.includes('reserved_slug')) {
      return { ok: false, error: 'Slug inválido o reservado.', field: 'slug' };
    }
    if (msg.includes('invalid_name')) {
      return { ok: false, error: 'Nombre inválido.', field: 'name' };
    }
    return { ok: false, error: `BD: ${msg}` };
  }

  if (!rpcData || typeof rpcData !== 'object') {
    return { ok: false, error: 'RPC provision_tenant devolvió respuesta inválida.' };
  }

  const result = rpcData as {
    tenant_id?: number;
    slug?: string;
    tokens?: ProvisionedTokens;
    coach_block_id?: number;
  };
  const newTenantId = Number(result.tenant_id);
  const tokens: ProvisionedTokens = result.tokens ?? {};

  if (!Number.isFinite(newTenantId) || newTenantId <= 0) {
    return { ok: false, error: 'RPC no devolvió tenant_id.' };
  }

  // 6. Invite al owner (best-effort: tenant queda creado aunque el email falle).
  const inviteResult = await inviteUserAction({
    email: trainerEmail,
    role: 'owner',
    fullNameHint: trainerFullName,
    tenantId: newTenantId,
    isAgencyAdmin: false,
    flavor: 'new_tenant_owner',
  });

  let inviteId: number | null = null;
  let emailSent = false;
  let inviteWarning: string | undefined;

  if (inviteResult.ok) {
    inviteId = inviteResult.inviteId;
    emailSent = true;
  } else {
    inviteWarning = inviteResult.error;
    emailSent = false;
  }

  // 7. Audit log extendido (action de admin form con metadata + IP + UA).
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const ua = h.get('user-agent') ?? null;
    await admin.from('tenant_audit_log').insert({
      tenant_id: newTenantId,
      actor_user_id: caller.userId,
      actor_email: caller.email,
      action: 'tenant.provisioned_via_admin_form',
      metadata: {
        slug,
        name,
        timezone,
        invite_email_sent: emailSent,
        invite_warning: inviteWarning ?? null,
        ip,
        user_agent: ua,
      },
    });
  } catch (err) {
    console.warn('[provisionTenantAction] audit extended skipped', { err: (err as Error).message });
  }

  // 8. Revalidate.
  revalidatePath('/admin/tenants');
  revalidatePath(`/admin/tenants/${newTenantId}`);

  return {
    ok: true,
    tenantId: newTenantId,
    slug,
    inviteId,
    emailSent,
    tokens,
    inviteWarning,
  };
}

// ----- markOnboardingCompleteAction ------------------------------------------

export type MarkOnboardingResult =
  | { ok: true; alreadyComplete: boolean }
  | { ok: false; error: string };

/**
 * Marca `tenants.onboarded_at = NOW()` para el tenant del caller.
 *
 * Caller permitido: owner del tenant O agency admin (vía impersonate).
 * Idempotente: si ya está marcado, devuelve `alreadyComplete: true`.
 */
export async function markOnboardingCompleteAction(): Promise<MarkOnboardingResult> {
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

  // Si el caller es agency admin con impersonate activo, su tenant_id en
  // profiles es el de la agencia; el tenant a marcar es el efectivo. Usamos
  // `getEffectiveTenant` no — para mantener este action simple, exigimos que
  // sea owner del tenant directamente, o agency admin operando dentro del
  // tenant target via impersonate cookie.
  //
  // Simplificación: el tenant target es el del profile, salvo que el caller
  // sea agency_admin (en cuyo caso usamos getEffectiveTenant).
  let targetTenantId = Number(profile.tenant_id);
  if (profile.is_agency_admin) {
    // Reusa la lógica de tenant efectivo (impersonate cookie).
    const { getEffectiveTenant } = await import('@/lib/effective-tenant');
    const effective = await getEffectiveTenant();
    if (!effective) return { ok: false, error: 'no_effective_tenant' };
    targetTenantId = effective.tenantId;
  } else if (profile.role !== 'owner') {
    return { ok: false, error: 'forbidden — solo owner puede marcar onboarding completo' };
  }

  const admin = getServiceRoleClient();
  const { data: tenant, error: readError } = await admin
    .from('tenants')
    .select('id, onboarded_at')
    .eq('id', targetTenantId)
    .maybeSingle();
  if (readError || !tenant) {
    return { ok: false, error: readError?.message ?? 'tenant_not_found' };
  }
  if (tenant.onboarded_at) {
    return { ok: true, alreadyComplete: true };
  }

  const { error: updateError } = await admin
    .from('tenants')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', targetTenantId);
  if (updateError) return { ok: false, error: updateError.message };

  // Audit.
  await admin.from('tenant_audit_log').insert({
    tenant_id: targetTenantId,
    actor_user_id: profile.id,
    actor_email: profile.email,
    action: 'tenant.onboarding_completed',
    metadata: {
      role: profile.role,
      is_agency_admin: profile.is_agency_admin,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath('/onboarding/integrations');
  revalidatePath('/admin/tenants');

  return { ok: true, alreadyComplete: false };
}
