'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { WidgetCard } from './widget-card';
import { reorderWidgets, type WidgetRow } from '@/lib/actions/dashboard-widgets';
import { getWidgetDef } from '@/lib/widget-catalog';
import type { ComputedWidgetValue } from '@/lib/widget-catalog';

interface Props {
  widgets: WidgetRow[];
  values: Record<number, ComputedWidgetValue>;
  canEdit: boolean;
  /**
   * Ventana y filtro global con los que se calcularon `values`. Cada tarjeta los
   * necesita para que su drill-down liste exactamente a quienes contó.
   */
  channelKey: string;
  fromIso: string;
  toIso: string;
}

export function WidgetsGrid({
  widgets: initialWidgets,
  values,
  canEdit,
  channelKey,
  fromIso,
  toIso,
}: Props) {
  const [widgets, setWidgets] = useState<WidgetRow[]>(initialWidgets);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || !canEdit) return;
    const activeId = Number(event.active.id);
    const overId = Number(event.over.id);
    if (activeId === overId) return;

    const oldIdx = widgets.findIndex((w) => w.id === activeId);
    const newIdx = widgets.findIndex((w) => w.id === overId);
    if (oldIdx < 0 || newIdx < 0) return;

    const newOrder = arrayMove(widgets, oldIdx, newIdx);
    setWidgets(newOrder); // optimistic UI

    startTransition(async () => {
      const r = await reorderWidgets(newOrder.map((w) => w.id));
      if (!r.ok) {
        toast.error(r.error);
        setWidgets(initialWidgets); // revert
      }
    });
  }

  if (widgets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-xs text-muted-foreground">
        Sin widgets configurados. Pulsa "Añadir widget" arriba para empezar.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {widgets.map((w, idx) => {
            const def = getWidgetDef(w.metricKey);
            if (!def) return null;
            const computed = values[w.id];
            if (!computed) return null;
            // Stagger CSS-puro (tw-animate-css). NO usamos motion aquí para no
            // pelearnos con @dnd-kit/sortable, que controla `transform` del nodo
            // sortable. El delay incremental cascadea la primera pintura; los
            // re-renders posteriores no re-disparan la animación (la clase ya
            // está aplicada, CSS animations no se repiten al re-render).
            return (
              <div
                key={w.id}
                className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-300"
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              >
                <WidgetCard
                  widget={w}
                  def={def}
                  computed={computed}
                  canEdit={canEdit}
                  channelKey={channelKey}
                  fromIso={fromIso}
                  toIso={toIso}
                />
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
