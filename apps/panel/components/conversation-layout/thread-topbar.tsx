'use client';

import { FolderInput, Tag, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AssignAction } from './actions/assign-action';
import { NotesAction } from './actions/notes-action';
import { UnreadToggleAction } from './actions/unread-toggle-action';
import { BlockAction } from './actions/block-action';
import { DeleteAction } from './actions/delete-action';
import { PlaceholderAction } from './actions/placeholder-action';
import { formatLeadName, leadInitials, formatChannelLong, isAiPaused } from './format-helpers';
import type {
  ConversationViewer,
  TenantMember,
  SelectedConversationDetail,
  ConversationNote,
} from './types';

interface Props {
  detail: SelectedConversationDetail;
  notes: ConversationNote[];
  viewer: ConversationViewer;
  members: TenantMember[];
}

export function ThreadTopbar({ detail, notes, viewer, members }: Props) {
  const lead = detail.lead;
  const name = formatLeadName(lead);
  const initials = leadInitials(lead);
  const paused = isAiPaused(detail.aiPausedUntil);
  const canModerate = viewer.role === 'owner' || viewer.isAgencyAdmin;

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-background/80 backdrop-blur px-4 py-2.5 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium uppercase shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex flex-col">
          <h2 className="text-sm font-semibold leading-tight truncate">{name}</h2>
          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
            <span>{formatChannelLong(detail.channel)}</span>
            <Badge variant="secondary" className="font-mono h-4 text-[9px] px-1.5">
              F{detail.phaseNumber}
            </Badge>
            {detail.isHandoffToHuman ? (
              <Badge
                variant="outline"
                className="h-4 text-[9px] px-1.5 border-rose-500/40 text-rose-400 bg-rose-500/5"
              >
                handoff{detail.handoffCause ? ` · ${detail.handoffCause}` : ''}
              </Badge>
            ) : null}
            {detail.isBlocked ? (
              <Badge
                variant="outline"
                className="h-4 text-[9px] px-1.5 border-amber-500/40 text-amber-400 bg-amber-500/5"
              >
                bloqueada
              </Badge>
            ) : null}
            {paused && !detail.isBlocked ? (
              <Badge
                variant="outline"
                className="h-4 text-[9px] px-1.5 border-amber-500/40 text-amber-400 bg-amber-500/5"
              >
                IA pausada
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center gap-1 shrink-0 flex-wrap justify-end',
          'max-md:hidden', // En mobile el shell muestra solo center → si entra ahí, mostrar
        )}
      >
        <AssignAction
          conversationId={detail.id}
          currentAssigneeUserId={detail.assignedUserId}
          viewerUserId={viewer.userId}
          members={members}
        />
        <NotesAction conversationId={detail.id} notes={notes} viewer={viewer} />
        <PlaceholderAction
          label="Mover"
          icon={FolderInput}
          tooltip="Próximamente Sprint Eta (sistema de etiquetas)"
        />
        <PlaceholderAction
          label="Etiquetas"
          icon={Tag}
          tooltip="Próximamente Sprint Eta"
        />
        <UnreadToggleAction
          conversationId={detail.id}
          currentlyUnread={detail.isUnread}
        />
        {canModerate ? (
          <BlockAction
            conversationId={detail.id}
            currentlyBlocked={detail.isBlocked}
            leadName={name}
          />
        ) : null}
        {canModerate ? (
          <DeleteAction conversationId={detail.id} leadName={name} />
        ) : null}
        <PlaceholderAction
          label="Programar mensaje"
          icon={Clock}
          tooltip="Próximamente Sprint Iota"
        />
      </div>
    </header>
  );
}
