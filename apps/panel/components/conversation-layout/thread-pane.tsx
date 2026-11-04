import { MessageSquare } from 'lucide-react';
import { MessagesTimeline } from '@/app/(app)/conversations/[id]/messages-timeline';
import { ThreadTopbar } from './thread-topbar';
import { ThreadComposer } from './thread-composer';
import { ThreadAutoRefresh } from './thread-auto-refresh';
import { ThreadScrollContainer } from './thread-scroll-container';
import type {
  ConversationViewer,
  TenantMember,
  SelectedConversationDetail,
  ConversationNote,
  TimelineMessage,
} from './types';
import type { LabelRow } from '@/lib/actions/labels';

interface Props {
  detail: SelectedConversationDetail | null;
  messages: TimelineMessage[];
  /**
   * La conversación tiene más mensajes de los que se cargan (los más recientes):
   * se avisa arriba del hilo para que nadie crea que empezó ahí (2026-11-04).
   */
  olderMessagesHidden?: boolean;
  /** Cuántos mensajes se cargan como máximo, para el aviso. */
  messagesShown?: number;
  notes: ConversationNote[];
  viewer: ConversationViewer;
  members: TenantMember[];
  allLabels: LabelRow[];
}

export function ThreadPane({
  detail,
  messages,
  olderMessagesHidden = false,
  messagesShown,
  notes,
  viewer,
  members,
  allLabels,
}: Props) {
  if (!detail) {
    return (
      <section
        className="flex flex-col h-full min-h-0 items-center justify-center text-center gap-4 p-8 bg-background"
        aria-label="Conversación"
      >
        <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <MessageSquare className="size-7" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-semibold tracking-tight">
            Selecciona una conversación
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Elige un chat de la lista para ver los mensajes y el panel de control.
          </p>
        </div>
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
      />
      <ThreadScrollContainer conversationId={detail.id} messageCount={messages.length}>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-8">
            Sin mensajes todavía.
          </p>
        ) : (
          <>
            {olderMessagesHidden ? (
              <p className="text-xs text-muted-foreground italic text-center pb-3">
                Esta conversación tiene más mensajes. Se muestran los{' '}
                {messagesShown ?? messages.length} más recientes.
              </p>
            ) : null}
            <MessagesTimeline messages={messages} />
          </>
        )}
      </ThreadScrollContainer>
      <ThreadComposer
        conversationId={detail.id}
        viewer={viewer}
        isBlocked={detail.isBlocked}
        isHandoffToHuman={detail.isHandoffToHuman}
      />
    </section>
  );
}
