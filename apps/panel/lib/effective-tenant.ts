import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveEffectiveTenantId } from '@/lib/impersonate';

/**
 * Resuelve el tenant_id que las páginas tenant-scoped deben usar:
 *   - Sin impersonate → el `profile.tenant_id` natural.
 *   - Con impersonate Y agency admin → el tenant de la cookie.
 *
 * Usar al inicio de Server Components que muestren datos tenant-scoped
 * (/dashboard, /conversations, /keywords, /settings/integrations) en vez de
 * leer `profile.tenant_id` directo.
 */
export type TenantMembershipRole = 'owner' | 'admin' | 'viewer';

export async function getEffectiveTenant(): Promise<{
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  /**
   * Rol del profile en SU tenant natural (NO en el impersonado). El agency
   * admin que impersonea sigue siendo "owner" de su tenant Fyzon. La
   * autorización per-action debe combinar `isAgencyAdmin || role === 'owner'`.
   */
  role: TenantMembershipRole;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, is_agency_admin, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return null;
  if (profile.is_active === false) return null;

  const { tenantId, isImpersonating } = await resolveEffectiveTenantId({
    profileTenantId: Number(profile.tenant_id),
    isAgencyAdmin: profile.is_agency_admin === true,
  });

  return {
    userId: user.id,
    tenantId,
    isAgencyAdmin: profile.is_agency_admin === true,
    isImpersonating,
    role: (profile.role as TenantMembershipRole | null) ?? 'owner',
  };
}
