import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Guard común para server actions /admin/*.
 *
 * Verifica que el caller esté autenticado y sea `is_agency_admin=true` activo.
 * Lanza `Error('unauthenticated' | 'forbidden')` si no.
 *
 * Devuelve los datos del profile que las server actions usan típicamente para
 * audit log y operaciones contra service_role.
 *
 * Reemplaza implementaciones inline duplicadas que existían en:
 *   - apps/panel/lib/actions/admin.ts (`requireAgencyAdmin`)
 *   - apps/panel/lib/actions/admins.ts (`assertCallerIsAgencyAdmin`)
 *   - apps/panel/lib/actions/invites.ts (parte de `assertCallerCanInvite`)
 */
export interface AgencyAdminCaller {
  userId: string;
  email: string;
  /** tenant_id del propio profile del admin (típicamente la fila agencia, NO el tenant cliente). */
  tenantId: number;
}

export async function requireAgencyAdmin(): Promise<AgencyAdminCaller> {
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

  return {
    userId: String(profile.id),
    email: String(profile.email),
    tenantId: Number(profile.tenant_id),
  };
}
