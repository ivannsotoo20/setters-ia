import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logout } from '@/lib/actions/auth';

/**
 * Dashboard placeholder protegido. El middleware ya redirige a /login
 * si no hay sesion, pero aqui hacemos doble check con getUser() server-side
 * porque el middleware corre en Edge runtime y NO leemos datos del usuario
 * alli (solo gating).
 *
 * Ademas resolvemos el profile + tenant para tener identidad multi-tenant
 * desde el primer render.
 */
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Cargamos el profile + tenant del usuario.
  // Nota: si el usuario acaba de hacer signup y todavia no tiene profile,
  // lo derivamos a /onboarding (todavia no implementado, asi que mostramos
  // un mensaje de "cuenta sin asignar"). El trigger DB que crea profile
  // automaticamente todavia no esta puesto — se hace en el wizard.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, full_name, role, created_at, tenants(slug, name)')
    .eq('id', user.id)
    .maybeSingle();

  // Supabase devuelve la relacion como array aunque sea FK 1:1 en runtime →
  // normalizamos a singular o null para uso en JSX.
  const tenantsRel = profile?.tenants as { slug: string; name: string }[] | { slug: string; name: string } | null | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? (tenantsRel[0] ?? null) : (tenantsRel ?? null);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Fyzon Setters · Panel</p>
          <h1 className="dashboard-title">
            {tenantInfo?.name ?? tenantInfo?.slug ?? 'Sin tenant asignado'}
          </h1>
        </div>
        <form action={logout}>
          <button type="submit" className="dashboard-logout">
            Cerrar sesion
          </button>
        </form>
      </header>

      <section className="dashboard-card">
        <h2>Identidad</h2>
        <dl className="dashboard-dl">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Rol</dt>
          <dd>{profile?.role ?? '—'}</dd>
          <dt>Tenant ID</dt>
          <dd>{profile?.tenant_id ?? '—'}</dd>
          <dt>Nombre</dt>
          <dd>{profile?.full_name ?? '—'}</dd>
        </dl>
      </section>

      <section className="dashboard-card">
        <h2>Que viene</h2>
        <ul className="dashboard-list">
          <li>Onboarding wizard de 3 pasos (API key ManyChat, plantilla, keywords)</li>
          <li>Configurador del coach v3 (formulario → markdown del Bloque 2)</li>
          <li>Visor de conversaciones en tiempo real</li>
          <li>Dashboard de los 3 KPIs (respuesta bienvenida, primera pregunta, % links)</li>
        </ul>
        <p className="dashboard-meta">
          Estado actual: Fase 2 · auth scaffold listo. Siguiente: onboarding wizard.
        </p>
      </section>
    </main>
  );
}
