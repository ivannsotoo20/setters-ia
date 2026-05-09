import { createSupabaseServerClient } from '@/lib/supabase/server';

export type TenantRole = 'owner' | 'admin' | 'viewer';
export type EffectiveRole = TenantRole | 'agency_admin';

export class AuthError extends Error {
  constructor(
    public code:
      | 'UNAUTHENTICATED'
      | 'PROFILE_NOT_FOUND'
      | 'PROFILE_INACTIVE'
      | 'FORBIDDEN_WRONG_TENANT'
      | 'FORBIDDEN_ROLE_REQUIRED'
      | 'FORBIDDEN_AGENCY_ADMIN_REQUIRED',
    public required?: TenantRole,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface RequireTenantRoleArgs {
  tenantId: number;
  role?: TenantRole;
  allowAgencyAdmin?: boolean;
}

export interface AuthorizedContext {
  userId: string;
  email: string;
  effectiveRole: EffectiveRole;
  isAgencyAdmin: boolean;
  profileTenantId: number;
}

/**
 * Centraliza la autorización tenant-scoped para Server Actions y Route Handlers.
 *
 * Reglas:
 *   - Si `is_agency_admin=true` y `allowAgencyAdmin !== false`, el caller pasa
 *     siempre como `agency_admin` independientemente de `tenantId`.
 *   - Si NO es agency admin: `profile.tenant_id` debe ser exactamente `tenantId`.
 *   - Si `role` se pasa, el `profile.role` debe matchear (jerarquía simple,
 *     sin "owner ≥ admin"). Para esa lógica usar `requireTenantRoleAtLeast`.
 *   - `is_active=false` siempre falla con `PROFILE_INACTIVE`.
 *
 * Lanza `AuthError` con `code` semántico (no usa redirect — la capa caller
 * decide si redirigir o devolver 403/toast).
 */
export async function requireTenantRole(
  args: RequireTenantRoleArgs,
): Promise<AuthorizedContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthError('UNAUTHENTICATED');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, is_agency_admin, role, is_active, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) throw new AuthError('PROFILE_NOT_FOUND');
  if (!profile.is_active) throw new AuthError('PROFILE_INACTIVE');

  const isAgencyAdmin = profile.is_agency_admin === true;
  const profileTenantId = Number(profile.tenant_id);

  if (isAgencyAdmin && args.allowAgencyAdmin !== false) {
    return {
      userId: user.id,
      email: profile.email,
      effectiveRole: 'agency_admin',
      isAgencyAdmin: true,
      profileTenantId,
    };
  }

  if (profileTenantId !== args.tenantId) {
    throw new AuthError('FORBIDDEN_WRONG_TENANT');
  }

  if (args.role && profile.role !== args.role) {
    throw new AuthError('FORBIDDEN_ROLE_REQUIRED', args.role);
  }

  return {
    userId: user.id,
    email: profile.email,
    effectiveRole: profile.role as TenantRole,
    isAgencyAdmin: false,
    profileTenantId,
  };
}

/**
 * Variante para acciones que requieren rol "al menos" owner — útil cuando una
 * acción la puede hacer owner Y admin, pero NO viewer.
 *
 * Jerarquía: owner > admin > viewer.
 */
export async function requireTenantRoleAtLeast(args: {
  tenantId: number;
  minRole: TenantRole;
  allowAgencyAdmin?: boolean;
}): Promise<AuthorizedContext> {
  const ctx = await requireTenantRole({
    tenantId: args.tenantId,
    allowAgencyAdmin: args.allowAgencyAdmin,
  });

  if (ctx.effectiveRole === 'agency_admin') return ctx;

  const order: Record<TenantRole, number> = { owner: 3, admin: 2, viewer: 1 };
  if (order[ctx.effectiveRole] < order[args.minRole]) {
    throw new AuthError('FORBIDDEN_ROLE_REQUIRED', args.minRole);
  }
  return ctx;
}

/**
 * Helper para acciones SOLO agency admin (ej. saveAdminOverrides, gestionar
 * sub-cuentas cross-tenant).
 */
export async function requireAgencyAdmin(): Promise<AuthorizedContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthError('UNAUTHENTICATED');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, is_agency_admin, role, is_active, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) throw new AuthError('PROFILE_NOT_FOUND');
  if (!profile.is_active) throw new AuthError('PROFILE_INACTIVE');
  if (profile.is_agency_admin !== true) {
    throw new AuthError('FORBIDDEN_AGENCY_ADMIN_REQUIRED');
  }

  return {
    userId: user.id,
    email: profile.email,
    effectiveRole: 'agency_admin',
    isAgencyAdmin: true,
    profileTenantId: Number(profile.tenant_id),
  };
}
