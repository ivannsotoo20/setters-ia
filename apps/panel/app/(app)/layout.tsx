import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ImpersonateBanner } from '@/components/impersonate-banner';
import { ScopeSwitcher } from '@/components/scope-switcher';
import { getImpersonateTenantId } from '@/lib/impersonate';

export const dynamic = 'force-dynamic';

/**
 * App shell layout — todo lo que cuelga de (app)/ vive bajo la sidebar +
 * topbar. Auth gating duplicado del middleware (defense in depth) +
 * profile lookup para pasarle tenant a la sidebar. Si el usuario es
 * agency admin Y tiene cookie de impersonate activa, mostramos banner.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, tenant_id, is_agency_admin, role, tenants(slug, name)')
    .eq('id', user.id)
    .maybeSingle();

  const tenantsRel = profile?.tenants as
    | { slug: string; name: string }
    | { slug: string; name: string }[]
    | null
    | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? tenantsRel[0] ?? null : tenantsRel ?? null;

  const isAgencyAdmin = profile?.is_agency_admin === true;
  const role = (profile?.role ?? 'owner') as 'owner' | 'admin' | 'viewer';
  // canManageTenant = puede modificar config sensible (prefs, integraciones,
  // miembros). Se aplica al sidebar trainer para no mostrar entradas que el
  // collaborator no puede usar.
  const canManageTenant = isAgencyAdmin || role === 'owner';

  // Si es agency admin y tiene cookie de impersonate, cargar el tenant
  // impersonado para mostrarlo en sidebar + banner.
  let impersonatingTenantName: string | null = null;
  let impersonatingTenantId: number | null = null;
  if (isAgencyAdmin) {
    const impersonateId = await getImpersonateTenantId();
    if (impersonateId != null) {
      impersonatingTenantId = impersonateId;
      const { data: impersonateTenant } = await supabase
        .from('tenants')
        .select('name, slug')
        .eq('id', impersonateId)
        .maybeSingle();
      if (impersonateTenant) {
        impersonatingTenantName = impersonateTenant.name ?? impersonateTenant.slug;
      }
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        tenantName={tenantInfo?.name ?? tenantInfo?.slug ?? null}
        userEmail={profile?.email ?? user.email ?? null}
        isAgencyAdmin={isAgencyAdmin}
        canManageTenant={canManageTenant}
        memberRole={role}
        impersonatingTenantName={impersonatingTenantName}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1" />
          <ScopeSwitcher
            isAgencyAdmin={isAgencyAdmin}
            impersonatingTenantId={impersonatingTenantId}
            impersonatingTenantName={impersonatingTenantName}
          />
        </header>
        {impersonatingTenantName ? (
          <ImpersonateBanner tenantName={impersonatingTenantName} />
        ) : null}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
