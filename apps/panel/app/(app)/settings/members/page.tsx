import { redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listMembers, listTenantPendingInvites } from '@/lib/actions/members';
import { MembersList } from '@/components/members-list';
import { getEffectiveTenant } from '@/lib/effective-tenant';

export const dynamic = 'force-dynamic';

export default async function SettingsMembersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const effective = await getEffectiveTenant();
  if (!effective) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isOwner = profile?.role === 'owner';
  const isAgencyAdmin = profile?.is_agency_admin === true;
  const canManage = isOwner || isAgencyAdmin;

  // Sprint Iota.5 hotfix — cargar miembros activos + invitaciones pendientes
  // en paralelo. Antes solo se mostraban los profiles ya existentes, lo que
  // ocultaba las invitaciones recién enviadas (el INSERT en `profiles` ocurre
  // al aceptar el invite, no al enviarlo).
  const [membersResult, invitesResult] = await Promise.all([
    listMembers({ tenantId: effective.tenantId }),
    listTenantPendingInvites({ tenantId: effective.tenantId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <UserCog className="size-3.5" />
          Equipo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Miembros de tu cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {canManage
            ? 'Invita a tu equipo (social media, asistentes) y gestiona sus accesos. Cada persona entra con su propio email.'
            : 'Personas con acceso al panel. Solo el owner puede modificar la lista.'}
        </p>
      </div>

      {membersResult.ok ? (
        <MembersList
          tenantId={effective.tenantId}
          initialMembers={membersResult.data ?? []}
          initialInvites={invitesResult.ok ? invitesResult.data ?? [] : []}
          canManage={canManage}
          currentUserId={user.id}
        />
      ) : (
        <p className="text-sm text-destructive">Error: {membersResult.error}</p>
      )}
    </div>
  );
}
