'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { PipelineCard } from './pipeline-card';
import { COLUMN_LABELS, COLUMN_COLORS, isOutcomeColumn } from '@/lib/pipeline-constants';
import type { PipelineCard as PipelineCardData } from '@/lib/pipeline-query';
import type { ColumnKey } from '@/lib/pipeline-constants';

interface Props {
  columnId: ColumnKey;
  cards: PipelineCardData[];
  canDrag: boolean;
  assigneeMap: Record<string, string>;
}

const INITIAL_PAGE = 50;

export function PipelineColumn({ columnId, cards, canDrag, assigneeMap }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { columnId },
  });
  const [shown, setShown] = useState(INITIAL_PAGE);

  const visible = cards.slice(0, shown);
  const hasMore = cards.length > shown;
  const isOutcome = isOutcomeColumn(columnId);

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col rounded-lg border border-border/40 bg-muted/20 transition-colors',
        'min-w-[260px] max-w-[260px] h-full',
        isOver && 'border-primary/60 bg-primary/5',
        isOutcome && 'bg-amber-500/[0.03] border-amber-500/20',
      )}
      aria-label={COLUMN_LABELS[columnId]}
    >
      <div className="px-2.5 py-2 border-b border-border/40 flex items-center justify-between gap-1.5 sticky top-0 bg-muted/40 backdrop-blur-sm z-10 rounded-t-lg">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: COLUMN_COLORS[columnId] }}
            aria-hidden
          />
          <span className="text-[11px] font-medium uppercase tracking-wide truncate">
            {COLUMN_LABELS[columnId]}
          </span>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
          {cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2"
      >
        <SortableContext items={visible.map((c) => String(c.id))} strategy={verticalListSortingStrategy}>
          {visible.length === 0 ? (
            <div className="text-[10px] text-muted-foreground/60 italic text-center pt-4">
              {isOutcome ? 'Sin outcomes' : 'Vacío'}
            </div>
          ) : (
            visible.map((c) => (
              <PipelineCard
                key={c.id}
                card={c}
                columnId={columnId}
                canDrag={canDrag}
                assigneeLabel={c.assignedUserId ? assigneeMap[c.assignedUserId] ?? null : null}
              />
            ))
          )}
        </SortableContext>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setShown((s) => s + INITIAL_PAGE)}
            className="text-[10px] text-muted-foreground hover:text-foreground py-1.5 underline"
          >
            Ver más ({cards.length - shown})
          </button>
        ) : null}
      </div>
    </div>
  );
}
