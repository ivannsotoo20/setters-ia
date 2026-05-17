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
  const accentColor = COLUMN_COLORS[columnId];

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col rounded-xl border border-border/60 bg-muted/30 transition-all duration-150 overflow-hidden',
        'min-w-[260px] max-w-[260px] h-full',
        isOver && 'ring-2 ring-primary/40 border-primary/60 bg-primary/[0.04]',
      )}
      aria-label={COLUMN_LABELS[columnId]}
    >
      {/* Accent stripe arriba — color del column */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />

      <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-between gap-2 sticky top-0 bg-background/70 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide truncate text-foreground/80">
            {COLUMN_LABELS[columnId]}
          </span>
        </div>
        <span
          className={cn(
            'text-[10px] font-medium tabular-nums shrink-0 rounded-full px-1.5 py-0.5',
            cards.length > 0
              ? 'bg-foreground/10 text-foreground/80'
              : 'text-muted-foreground/50',
          )}
        >
          {cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5"
      >
        <SortableContext items={visible.map((c) => String(c.id))} strategy={verticalListSortingStrategy}>
          {visible.length === 0 ? (
            <div className="text-[10px] text-muted-foreground/60 italic text-center pt-6">
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
            className="text-[10px] text-muted-foreground hover:text-foreground py-2 mt-1 border border-dashed border-border/50 rounded-md hover:border-border hover:bg-muted/40 transition-colors"
          >
            Ver {Math.min(INITIAL_PAGE, cards.length - shown)} más ({cards.length - shown} restantes)
          </button>
        ) : null}
      </div>
    </div>
  );
}
