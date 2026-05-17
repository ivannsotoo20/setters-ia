'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { LabelChip } from '@/components/labels/label-chip';
import { cn } from '@/lib/utils';
import {
  type LeadListRow,
  getLastMessageAt,
  getMaxPhase,
  getUniqueLabels,
  getAssignedSummary,
  isLeadAiPaused,
} from '@/lib/lead-list-query';
import {
  formatLeadName,
  leadInitials,
  formatChannelShort,
  formatRelative,
} from '@/components/conversation-layout/format-helpers';

interface Props {
  row: LeadListRow;
  isSelected: boolean;
  assigneeLabel: string | null;
}

export function ContactsListItem({ row, isSelected, assigneeLabel }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const channel = row.conversations[0]?.channel_type ?? null;
  const provider = row.conversations[0]?.via_provider ?? null;
  const lastMsgAt = getLastMessageAt(row);
  const maxPhase = getMaxPhase(row);
  const labels = getUniqueLabels(row).slice(0, 3);
  const totalLabels = getUniqueLabels(row).length;
  const assigned = getAssignedSummary(row);
  const aiPaused = isLeadAiPaused(row);

  const onSelect = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', String(row.id));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const leadFor = {
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username,
    external_id: row.external_id,
  };

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'group/contact-item relative w-full flex items-center gap-3 px-3 py-3 border-b border-border/40 text-left transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/8 hover:bg-primary/10 dark:bg-primary/15 dark:hover:bg-primary/20',
        )}
      >
        {isSelected ? (
          <span
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary"
            aria-hidden
          />
        ) : null}
        {/* Avatar */}
        <span
          className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0"
          aria-hidden
        >
          {leadInitials(leadFor)}
        </span>

        {/* Identity + meta */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm truncate">{formatLeadName(leadFor)}</span>
            {channel ? (
              <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground border border-border rounded px-1 py-px">
                {formatChannelShort({ channel_type: channel, via_provider: provider ?? '' })}
              </span>
            ) : null}
            {aiPaused ? (
              <span
                className="shrink-0 text-[10px] font-medium border border-warning/40 bg-warning/10 text-warning rounded px-1.5 py-px"
                title="IA pausada (handoff o manual)"
              >
                IA off
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
            <span className="truncate">
              {row.phone ?? row.email ?? row.username ?? row.external_id}
            </span>
            <span className="shrink-0">·</span>
            <span className="shrink-0 tabular-nums">
              F{maxPhase} · {row.conversations.length} conv
            </span>
          </div>
          {labels.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {labels.map((l) => (
                <LabelChip key={l.id} label={l} size="mini" />
              ))}
              {totalLabels > labels.length ? (
                <span className="text-[10px] text-muted-foreground">
                  +{totalLabels - labels.length}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right column: dates + assignee + chevron */}
        <div className="flex flex-col items-end gap-1 shrink-0 text-[10px] text-muted-foreground">
          <span className="tabular-nums">{formatRelative(lastMsgAt)}</span>
          {assigned.display === 'unassigned' ? (
            <span className="italic">Sin asignar</span>
          ) : assigneeLabel ? (
            <span className="truncate max-w-[80px]" title={assigneeLabel}>
              {assigneeLabel}
            </span>
          ) : (
            <span className="italic">Asignado</span>
          )}
          {row.conversations[0] ? (
            <Link
              href={`/conversations?selected=${row.conversations[0].id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-foreground inline-flex items-center gap-0.5"
              title="Ir al chat de la conversación principal"
            >
              <MessageSquare className="size-3" />
              <ChevronRight className="size-3" />
            </Link>
          ) : null}
        </div>
      </button>
    </li>
  );
}
