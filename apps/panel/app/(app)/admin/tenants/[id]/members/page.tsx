import { notFound, redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listMembers } from '@/lib/actions/members';
import { MembersList } from '@/components/members-list';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TenantMembersPage({ params }: Props) {
  const { id } = await params;
  const tenantId = Number(id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  const result = await listMembers({ tenantId });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <UserCog className="size-3.5" />
          Miembros
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios de la sub-cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona quién tiene acceso al panel: el owner (titular) y los colaboradores
          (social media, asistentes). Cada uno entra con su propio email + contraseña.
        </p>
      </div>

      {result.ok ? (
        <MembersList
          tenantId={tenantId}
          initialMembers={result.data ?? []}
          canManage={true}
          currentUserId={user.id}
        />
      ) : (
        <p className="text-sm text-destructive">Error: {result.error}</p>
      )}
    </div>
  );
}
