import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logout } from '@/lib/actions/auth';
import { ConversationsTable } from './conversations-table';

export const dynamic = 'force-dynamic';

interface ConversationRow {
  id: number;
  lead_id: number;
  channel_id: number;
  phase_number: number;
  state: string;
  conversation_source: string | null;
  ai_paused_until: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean | null;
  leads:
    | {
        first_name: string | null;
        last_name: string | null;
        username: string | null;
        external_id: string;
      }
    | { first_name: string | null; last_name: string | null; username: string | null; external_id: string }[]
    | null;
  channels:
    | { channel_type: string; via_provider: string }
    | { channel_type: string; via_provider: string }[]
    | null;
}

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, full_name, role, tenants(slug, name)')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return (
      <main className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Fyzon Setters · Panel</p>
            <h1 className="dashboard-title">Sin tenant asignado</h1>
          </div>
          <form action={logout}>
            <button type="submit" className="dashboard-logout">
              Cerrar sesion
            </button>
          </form>
        </header>
        <section className="dashboard-card">
          <p>
            Tu profile no tiene un tenant asociado. Contacta con un admin para
            que te asigne uno.
          </p>
        </section>
      </main>
    );
  }

  const tenantsRel = profile.tenants as
    | { slug: string; name: string }
    | { slug: string; name: string }[]
    | null
    | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? tenantsRel[0] ?? null : tenantsRel ?? null;

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(
      `id, lead_id, channel_id, phase_number, state, conversation_source,
       ai_paused_until, last_message_at, created_at, updated_at,
       is_qualified, is_handoff_to_human,
       leads(first_name, last_name, username, external_id),
       channels(channel_type, via_provider)`,
    )
    .eq('tenant_id', profile.tenant_id)
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Fyzon Setters · Panel</p>
          <h1 className="dashboard-title">
            {tenantInfo?.name ?? tenantInfo?.slug ?? `Tenant ${profile.tenant_id}`}
          </h1>
        </div>
        <form action={logout}>
          <button type="submit" className="dashboard-logout">
            Cerrar sesion
          </button>
        </form>
      </header>

      <nav className="dashboard-nav">
        <Link href="/dashboard" className="dashboard-nav-link">
          Dashboard
        </Link>
        <Link href="/conversations" className="dashboard-nav-link is-active">
          Conversaciones
        </Link>
      </nav>

      <section className="dashboard-card">
        <header className="dashboard-card-header">
          <h2>Conversaciones</h2>
          <p className="dashboard-card-meta">
            {conversations?.length ?? 0} resultados · ordenadas por última
            actualización
          </p>
        </header>

        {error ? (
          <p className="dashboard-error">Error cargando conversaciones: {error.message}</p>
        ) : (conversations?.length ?? 0) === 0 ? (
          <p className="dashboard-empty">
            Sin conversaciones todavía. Cuando llegue el primer lead via IG /
            WhatsApp aparecerá aquí.
          </p>
        ) : (
          <ConversationsTable rows={(conversations ?? []) as unknown as ConversationRow[]} />
        )}
      </section>
    </main>
  );
}
