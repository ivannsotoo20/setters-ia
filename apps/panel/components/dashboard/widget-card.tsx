'use client';

import { useState, useTransition } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ArrowDownRight, ArrowUpRight, Minus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDelta,
  type KpiValue,
  type RateKpiValue,
} from '@/lib/dashboard-metrics';
import { formatPercent } from '@/lib/pipeline-metrics';
import type { ComputedWidgetValue, WidgetMetricDef } from '@/lib/widget-catalog';
import { deleteWidget } from '@/lib/actions/dashboard-widgets';
import type { WidgetRow } from '@/lib/actions/dashboard-widgets';
import { WidgetDrilldownSheet } from './widget-drilldown-sheet';

const CHANNEL_LABELS: Record<string, string> = {
  wa: 'WhatsApp',
  fb: 'Facebook',
  'ig-in': 'IG inbound',
  'ig-out': 'IG outbound',
};

interface Props {
  widget: WidgetRow;
  def: WidgetMetricDef;
  computed: ComputedWidgetValue;
  canEdit: boolean;
  /** Ventana y filtro global con los que se calculó `computed` — el drill-down lista a los mismos. */
  channelKey: string;
  fromIso: string;
  toIso: string;
}

export function WidgetCard({
  widget,
  def,
  computed,
  canEdit,
  channelKey,
  fromIso,
  toIso,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !canEdit,
  });
  const [isPending, startTransition] = useTransition();
  // Drill-down (2026-09-02): pulsar el número abre la lista de personas que lo forman.
  const [drilldownOpen, setDrilldownOpen] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isVolume = computed.category === 'volume';
  const value = computed.value;
  const displayValue = isVolume
    ? new Intl.NumberFormat('es-ES').format((value as KpiValue).current)
    : (value as RateKpiValue).denominator === 0
      ? '—'
      : formatPercent((value as RateKpiValue).current);
  const deltaText = formatDelta(value);
  const deltaSign = value.deltaSign;

  function onDelete() {
    if (isPending) return;
    if (!confirm(`¿Eliminar widget "${def.label}"?`)) return;
    startTransition(async () => {
      const r = await deleteWidget(widget.id);
      if (!r.ok) toast.error(r.error);
      else toast.success('Widget eliminado');
    });
  }

  const channelChip = widget.filter.channel ? CHANNEL_LABELS[widget.filter.channel] : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Card ref={setNodeRef} style={style} className="bg-muted/20 border-border/50 group relative">
        {canEdit ? (
          <>
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="absolute top-1 left-1 p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
              aria-label="Mover widget"
            >
              <GripVertical className="size-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-destructive transition-opacity"
              aria-label="Eliminar widget"
            >
              <X className="size-3 text-muted-foreground" />
            </button>
          </>
        ) : null}
        <CardContent className="p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground pr-5">
            <span className="truncate">{def.label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-xs">{def.description}</TooltipContent>
            </Tooltip>
          </div>
          {channelChip ? (
            <Badge variant="outline" className="h-4 text-[8px] px-1 self-start font-normal">
              {channelChip}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => setDrilldownOpen(true)}
            className="self-start text-left text-2xl font-semibold tabular-nums leading-none rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
            title="Ver quién está en esta métrica"
            aria-label={`Ver la lista de personas de ${def.label}`}
          >
            {displayValue}
          </button>
          <div className="flex items-center gap-1 text-[10px] tabular-nums">
            {value.hasInsufficientData ? (
              <span className="text-muted-foreground/70">datos insuficientes</span>
            ) : value.deltaPct == null ? (
              <span className="text-muted-foreground">— (sin periodo previo)</span>
            ) : (
              <>
                {deltaSign === 'up' ? (
                  <ArrowUpRight className="size-3 text-success" />
                ) : deltaSign === 'down' ? (
                  <ArrowDownRight className="size-3 text-destructive" />
                ) : (
                  <Minus className="size-3 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    deltaSign === 'up' && 'text-success',
                    deltaSign === 'down' && 'text-destructive',
                    deltaSign === 'flat' && 'text-muted-foreground',
                  )}
                >
                  {deltaText}
                </span>
                <span className="text-muted-foreground/70">vs anterior</span>
              </>
            )}
            {!isVolume ? (
              <span className="text-muted-foreground/70 ml-1">
                ({(value as RateKpiValue).numerator}/{(value as RateKpiValue).denominator})
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <WidgetDrilldownSheet
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        def={def}
        filter={widget.filter}
        channelKey={channelKey}
        fromIso={fromIso}
        toIso={toIso}
        displayValue={displayValue}
      />
    </TooltipProvider>
  );
}
