import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user!.id)
    .maybeSingle();

  if (!profile?.tenant_id) notFound();

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/conversations">
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground font-mono">#{conv.id}</span>
      </div>

      <ConversationHeader conv={conv as never} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <CardDescription>
            {messages?.length ?? 0} mensajes · ordenados cronológicamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(messages?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
          ) : (
            <MessagesTimeline messages={(messages ?? []) as TimelineMessage[]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
