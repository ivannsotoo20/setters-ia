import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

/**
 * App shell layout — todo lo que cuelga de (app)/ vive bajo la sidebar +
 * topbar. Auth gating duplicado del middleware (defense in depth) +
 * profile lookup para pasarle tenant a la sidebar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, tenant_id, tenants(slug, name)')
    .eq('id', user.id)
    .maybeSingle();

  const tenantsRel = profile?.tenants as
    | { slug: string; name: string }
    | { slug: string; name: string }[]
    | null
    | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? tenantsRel[0] ?? null : tenantsRel ?? null;

  return (
    <SidebarProvider>
      <AppSidebar
        tenantName={tenantInfo?.name ?? tenantInfo?.slug ?? null}
        userEmail={profile?.email ?? user.email ?? null}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
