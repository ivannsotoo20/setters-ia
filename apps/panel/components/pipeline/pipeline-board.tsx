'use client';

import { useOptimistic, useState, useTransition } from 'react';
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
  OUTCOME_BUCKETS,
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

type MoveAction = {
  type: 'move';
  cardId: number;
  from: ColumnKey;
  to: ColumnKey;
};

/**
 * Reducer del optimistic state.
 *
 * Replica la lógica server-side de `applyPipelineOutcome`:
 *   - Mover card de `from` a `to`.
 *   - Si `to` es outcome → quitar también de cualquier otro outcome (mutual
 *     exclusion: una card solo puede estar en UN outcome a la vez).
 *
 * Si la action falla server-side, React descarta este optimistic state al
 * terminar la transition (porque `columns` prop no cambia vía revalidate). Si
 * tiene éxito, el revalidate llega con el nuevo `columns` real y reemplaza.
 */
function moveReducer(
  state: Record<ColumnKey, PipelineCardData[]>,
  action: MoveAction,
): Record<ColumnKey, PipelineCardData[]> {
  const { cardId, from, to } = action;
  // Localizar la card a mover (puede estar en `from` o ya haber sido movida).
  const cardObj =
    state[from]?.find((c) => c.id === cardId) ??
    Object.values(state)
      .flat()
      .find((c) => c.id === cardId);
  if (!cardObj) return state;

  // Clonar superficial cada columna afectada (no mutar arrays originales).
  const next: Record<ColumnKey, PipelineCardData[]> = { ...state };
  next[from] = (state[from] ?? []).filter((c) => c.id !== cardId);

  // Mutual exclusion outcome: si target es outcome, quitar de los demás outcomes.
  if (isOutcomeColumn(to)) {
    for (const col of OUTCOME_BUCKETS) {
      if (col !== to) {
        next[col] = (next[col] ?? state[col] ?? []).filter((c) => c.id !== cardId);
      }
    }
  }

  // Insertar al inicio del target (visualmente al top como en server reorder).
  next[to] = [cardObj, ...(next[to] ?? state[to] ?? []).filter((c) => c.id !== cardId)];

  return next;
}

export function PipelineBoard({ columns, canDrag, assigneeMap }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticColumns, applyOptimistic] = useOptimistic(columns, moveReducer);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const allCards: PipelineCardData[] = Object.values(optimisticColumns).flat();
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
      // Optimistic UI: mueve la card al instante. Si la action falla, React
      // descarta este state al terminar la transition (no llega revalidate).
      applyOptimistic({
        type: 'move',
        cardId: conversationId,
        from: sourceColId,
        to: targetColId,
      });

      if (isOutcomeColumn(targetColId)) {
        const r = await applyPipelineOutcome({
          conversationId,
          bucket: targetColId as OutcomeBucket,
        });
        if (!r.ok) toast.error(r.error);
        else toast.success('Movido', { duration: 1800 });
      } else {
        // Outcome → fase: quita outcome label, motor recolocará en su phase_number.
        const r = await removePipelineOutcome({ conversationId });
        if (!r.ok) toast.error(r.error);
        else toast.success('Outcome quitado', { duration: 1800 });
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
                    cards={optimisticColumns[colId] ?? []}
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
