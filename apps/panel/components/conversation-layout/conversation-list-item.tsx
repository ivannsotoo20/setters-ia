'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Pause, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  formatLeadName,
  leadInitials,
  formatChannelDirectionShort,
  formatRelative,
  isAiPaused,
} from './format-helpers';
import { LabelChip } from '@/components/labels/label-chip';
import type { ConversationListRow } from '@/lib/conversation-list-query';

interface Props {
  row: ConversationListRow;
  isSelected: boolean;
  assigneeLabel?: string | null;
}

export function ConversationListItem({ row, isSelected, assigneeLabel }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lead = row.leads;
  const channel = row.channels;
  const paused = isAiPaused(row.ai_paused_until);

  const onSelect = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', String(row.id));
    // Si estamos en /conversations/[id] mover a /conversations canonical para
    // evitar dobles fuentes de selectedId.
    const target = pathname.startsWith('/conversations/') ? '/conversations' : pathname;
    router.replace(`${target}?${params.toString()}`, { scroll: false });
  };

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'group/conv-item w-full text-left flex gap-3 px-3 py-3 border-b border-border/40 transition-colors relative',
          'hover:bg-muted/50 focus:outline-none focus:bg-muted/60',
          isSelected && 'bg-primary/8 hover:bg-primary/10 dark:bg-primary/15 dark:hover:bg-primary/20',
        )}
        aria-current={isSelected ? 'true' : undefined}
      >
        {isSelected ? (
          <span
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary"
            aria-hidden
          />
        ) : null}
        <div className="relative shrink-0">
          <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold uppercase">
            {leadInitials(lead)}
          </div>
          {row.is_unread ? (
            <span
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-background"
              aria-label="No leído"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                row.is_unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
              )}
            >
              {formatLeadName(lead)}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {formatRelative(row.last_message_at ?? null)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-normal shrink-0">
              {formatChannelDirectionShort(channel, row.direction)}
            </Badge>
            <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-mono shrink-0">
              F{row.phase_number}
            </Badge>
            {row.is_handoff_to_human ? (
              <Badge variant="destructive" className="h-4 text-[9px] px-1.5 font-normal shrink-0">
                handoff
              </Badge>
            ) : null}
            {paused ? (
              <Pause className="size-3 text-warning shrink-0" aria-label="IA pausada" />
            ) : null}
            {assigneeLabel ? (
              <span className="text-[10px] text-muted-foreground truncate">
                <MessageSquareText className="size-2.5 inline -mt-0.5 mr-0.5" />
                {assigneeLabel}
              </span>
            ) : null}
          </div>
          {row.labels && row.labels.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {row.labels.slice(0, 3).map((l) => (
                <LabelChip key={l.id} size="mini" label={l} />
              ))}
              {row.labels.length > 3 ? (
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  +{row.labels.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}
