import { MessageSquare } from 'lucide-react';
import { MessagesTimeline } from '@/app/(app)/conversations/[id]/messages-timeline';
import { ThreadTopbar } from './thread-topbar';
import { ThreadComposer } from './thread-composer';
import { ThreadAutoRefresh } from './thread-auto-refresh';
import type {
  ConversationViewer,
  TenantMember,
  SelectedConversationDetail,
  ConversationNote,
  TimelineMessage,
} from './types';
import type { LabelRow } from '@/lib/actions/labels';
import type { FollowupTemplateRow } from '@/lib/actions/followups';

interface Props {
  detail: SelectedConversationDetail | null;
  messages: TimelineMessage[];
  notes: ConversationNote[];
  viewer: ConversationViewer;
  members: TenantMember[];
  allLabels: LabelRow[];
  followupTemplates: FollowupTemplateRow[];
}

export function ThreadPane({
  detail,
  messages,
  notes,
  viewer,
  members,
  allLabels,
  followupTemplates,
}: Props) {
  if (!detail) {
    return (
      <section
        className="flex flex-col h-full min-h-0 items-center justify-center text-center gap-3 p-8 bg-background"
        aria-label="Conversación"
      >
        <MessageSquare className="size-10 text-muted-foreground/40" />
        <h3 className="text-sm font-medium text-muted-foreground">
          Selecciona una conversación
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Elige un chat de la lista para ver los mensajes y el panel de control.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col h-full min-h-0 bg-background min-w-0" aria-label="Conversación">
      <ThreadAutoRefresh enabled={!detail.isBlocked} />
      <ThreadTopbar
        detail={detail}
        notes={notes}
        viewer={viewer}
        members={members}
        allLabels={allLabels}
        followupTemplates={followupTemplates}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-8">
            Sin mensajes todavía.
          </p>
        ) : (
          <MessagesTimeline messages={messages} />
        )}
      </div>
      <ThreadComposer
        conversationId={detail.id}
        viewer={viewer}
        isBlocked={detail.isBlocked}
        isHandoffToHuman={detail.isHandoffToHuman}
      />
    </section>
  );
}
