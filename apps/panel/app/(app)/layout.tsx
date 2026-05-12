import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ScopeSwitcher } from '@/components/scope-switcher';
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner';
import { getImpersonateTenantId, resolveEffectiveTenantId } from '@/lib/impersonate';
import { getTenantHealth } from '@/lib/tenant-health';

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

  // Onboarding banner: cargamos el health del tenant efectivo para decidir si
  // mostramos el aviso "estás en modo configuración". El client component
  // OnboardingBanner se autosuprime en `/admin/*` y `/onboarding/*` (via usePathname).
  let onboardingBannerMode: 'trainer' | 'admin_impersonating' | null = null;
  let coachIsPlaceholder = false;
  if (profile?.tenant_id) {
    const { tenantId: effectiveId } = await resolveEffectiveTenantId({
      profileTenantId: Number(profile.tenant_id),
      isAgencyAdmin,
    });
    const health = await getTenantHealth(effectiveId);
    if (health && health.onboardedAt == null) {
      onboardingBannerMode = isAgencyAdmin ? 'admin_impersonating' : 'trainer';
      coachIsPlaceholder = health.coachV3IsPlaceholder;
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
      <SidebarInset className="min-w-0">
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
        {/*
          Banner de impersonate eliminado a petición del usuario (Hito 11.1).
          La señal visual de que está impersonando ya está en:
            - Badge del ScopeSwitcher en el header.
            - Subtítulo "Viendo: <tenant>" del sidebar.
          Para salir del modo viendo: ScopeSwitcher → "Vista admin", o ir a /admin/tenants.

          Banner de onboarding (Sprint Crear Sub-cuenta): se muestra solo si
          el tenant efectivo tiene onboarded_at IS NULL. El client component
          decide en runtime si suprimirse según pathname (/admin/* y
          /onboarding/* lo ocultan).
        */}
        {onboardingBannerMode != null ? (
          <OnboardingBanner
            mode={onboardingBannerMode}
            coachIsPlaceholder={coachIsPlaceholder}
          />
        ) : null}
        <main className="flex-1 min-w-0 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
