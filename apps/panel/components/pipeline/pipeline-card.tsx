'use client';

import Link from 'next/link';
import { Pause } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { LabelChip } from '@/components/labels/label-chip';
import {
  formatLeadName,
  leadInitials,
  formatChannelDirectionShort,
  formatRelative,
  isAiPaused,
} from '@/components/conversation-layout/format-helpers';
import type { PipelineCard as PipelineCardData } from '@/lib/pipeline-query';
import type { ColumnKey } from '@/lib/pipeline-constants';

interface Props {
  card: PipelineCardData;
  columnId: ColumnKey;
  canDrag: boolean;
  assigneeLabel?: string | null;
}

export function PipelineCard({ card, columnId, canDrag, assigneeLabel }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(card.id),
    data: { columnId },
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const lead = card.lead;
  const channel = card.channel;
  const paused = isAiPaused(card.aiPausedUntil);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative rounded-md border border-border/60 bg-card p-2.5 shadow-sm',
        'hover:border-border transition-colors',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed',
      )}
      aria-label={`Card de ${formatLeadName(lead)}`}
    >
      <div className="flex gap-2 items-start min-w-0">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium uppercase shrink-0">
          {leadInitials(lead)}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <Link
            href={`/conversations?selected=${card.id}`}
            className="truncate text-xs font-medium hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {formatLeadName(lead)}
          </Link>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal shrink-0">
              {formatChannelDirectionShort(channel, card.direction)}
            </Badge>
            <Badge variant="secondary" className="h-3.5 text-[8px] px-1 font-mono shrink-0">
              F{card.phaseNumber}
            </Badge>
            {paused ? (
              <Pause className="size-2.5 text-amber-400 shrink-0" aria-label="IA pausada" />
            ) : null}
            <span className="ml-auto text-[9px] tabular-nums text-muted-foreground">
              {formatRelative(card.lastMessageAt ?? null)}
            </span>
          </div>
          {card.labels.length > 0 ? (
            <div className="flex items-center gap-1 flex-wrap">
              {card.labels.slice(0, 2).map((l) => (
                <LabelChip
                  key={l.id}
                  size="mini"
                  label={{ id: l.id, name: l.name, color: l.color }}
                />
              ))}
              {card.labels.length > 2 ? (
                <span className="text-[8px] text-muted-foreground tabular-nums">
                  +{card.labels.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}
          {assigneeLabel ? (
            <span className="text-[9px] text-muted-foreground truncate">
              · {assigneeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
