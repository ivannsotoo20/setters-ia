import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logout } from '@/lib/actions/auth';
import { ConversationHeader } from './conversation-header';
import { MessagesTimeline, type TimelineMessage } from './messages-timeline';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) notFound();

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, tenants(slug, name)')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    redirect('/dashboard');
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select(
      `id, lead_id, channel_id, phase_number, state, conversation_source,
       ai_paused_until, last_message_at, created_at, updated_at,
       is_qualified, is_handoff_to_human,
       handoff_cause, handoff_reason, handoff_at,
       leads(first_name, last_name, username, external_id, phone, email),
       channels(channel_type, via_provider)`,
    )
    .eq('id', conversationId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!conv) notFound();

  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('id, source, content_type, content, transcription, media_url, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(200);

  const tenantsRel = profile.tenants as
    | { slug: string; name: string }
    | { slug: string; name: string }[]
    | null
    | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? tenantsRel[0] ?? null : tenantsRel ?? null;

  return (
    <main className="dashboard-shell dashboard-shell--wide">
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

      <ConversationHeader conv={conv as never} />

      <section className="dashboard-card dashboard-card--padded">
        <header className="dashboard-card-header">
          <h2>Timeline</h2>
          <p className="dashboard-card-meta">{messages?.length ?? 0} mensajes</p>
        </header>
        {(messages?.length ?? 0) === 0 ? (
          <p className="dashboard-empty">Sin mensajes todavía.</p>
        ) : (
          <MessagesTimeline messages={(messages ?? []) as TimelineMessage[]} />
        )}
      </section>
    </main>
  );
}
