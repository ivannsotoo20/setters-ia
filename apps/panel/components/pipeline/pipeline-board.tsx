'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { PipelineColumn } from './pipeline-column';
import { PipelineCardOverlay } from './pipeline-card-overlay';
import {
  COLUMN_ORDER,
  PHASE_COLUMNS,
  isOutcomeColumn,
  type ColumnKey,
  type OutcomeBucket,
} from '@/lib/pipeline-constants';
import {
  applyPipelineOutcome,
  removePipelineOutcome,
} from '@/lib/actions/pipeline';
import type { PipelineCard as PipelineCardData } from '@/lib/pipeline-query';

interface Props {
  columns: Record<ColumnKey, PipelineCardData[]>;
  canDrag: boolean;
  assigneeMap: Record<string, string>;
}

export function PipelineBoard({ columns, canDrag, assigneeMap }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const allCards: PipelineCardData[] = Object.values(columns).flat();
  const activeCard = activeId ? allCards.find((c) => String(c.id) === activeId) ?? null : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!canDrag) return;
    if (!event.over) return;
    const sourceColId = event.active.data.current?.columnId as ColumnKey | undefined;
    const targetColId = (event.over.data.current?.columnId ?? event.over.id) as ColumnKey;
    if (!sourceColId || sourceColId === targetColId) return;
    const conversationId = Number(event.active.id);
    if (!Number.isFinite(conversationId)) return;

    // Drag F→F no persiste (motor decide phase_number).
    if (
      (PHASE_COLUMNS as readonly string[]).includes(sourceColId) &&
      (PHASE_COLUMNS as readonly string[]).includes(targetColId)
    ) {
      toast.info(
        'Las fases F1-F7 las controla la IA. Para mover manualmente, arrastra a una columna de outcome (Cancelada / No-Show / Recontacto / Ganado / Perdido).',
      );
      return;
    }

    startTransition(async () => {
      if (isOutcomeColumn(targetColId)) {
        const r = await applyPipelineOutcome({
          conversationId,
          bucket: targetColId as OutcomeBucket,
        });
        if (!r.ok) toast.error(r.error);
        else toast.success('Movido');
      } else {
        // Outcome → fase: quita outcome label, motor recolocará en su phase_number.
        const r = await removePipelineOutcome({ conversationId });
        if (!r.ok) toast.error(r.error);
        else toast.success('Outcome quitado');
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="h-full w-full overflow-x-auto overflow-y-hidden">
        <div className="flex gap-2.5 h-full w-max px-3 pb-3">
          {COLUMN_ORDER.map((colId) => {
            const isFirstOutcome = colId === 'cancelled';
            return (
              <div key={colId} className="flex h-full shrink-0 items-stretch">
                {isFirstOutcome ? (
                  <div className="w-px bg-border/60 mx-1.5 shrink-0" aria-hidden />
                ) : null}
                <div className="h-full shrink-0" style={{ width: 260 }}>
                  <PipelineColumn
                    columnId={colId}
                    cards={columns[colId] ?? []}
                    canDrag={canDrag}
                    assigneeMap={assigneeMap}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DragOverlay>{activeCard ? <PipelineCardOverlay card={activeCard} /> : null}</DragOverlay>
    </DndContext>
  );
}
