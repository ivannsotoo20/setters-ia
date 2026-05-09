'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Pause, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  formatLeadName,
  leadInitials,
  formatChannelShort,
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
          'w-full text-left flex gap-3 px-3 py-2.5 border-b border-border/50 transition-colors',
          'hover:bg-muted/40 focus:outline-none focus:bg-muted/60',
          isSelected && 'bg-muted/70 hover:bg-muted/70',
        )}
        aria-current={isSelected ? 'true' : undefined}
      >
        <div className="relative shrink-0">
          <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium uppercase">
            {leadInitials(lead)}
          </div>
          {row.is_unread ? (
            <span
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
              aria-label="No leído"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                row.is_unread ? 'font-semibold' : 'font-medium',
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
              {formatChannelShort(channel)}
            </Badge>
            <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-mono shrink-0">
              F{row.phase_number}
            </Badge>
            {row.is_handoff_to_human ? (
              <Badge
                variant="outline"
                className="h-4 text-[9px] px-1.5 font-normal border-rose-500/40 text-rose-400 bg-rose-500/5 shrink-0"
              >
                handoff
              </Badge>
            ) : null}
            {paused ? (
              <Pause className="size-3 text-amber-400 shrink-0" aria-label="IA pausada" />
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
