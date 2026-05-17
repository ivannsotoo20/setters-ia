'use client';

import { X, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Sprint Iota.1.d — Selector simple de intervalos para seguimientos.
 *
 * Sustituye la timeline visual previa (chips sobre eje 24h) por una lista
 * de dropdowns intuitivos: "Seguimiento #1 = 6h", "Seguimiento #2 = 12h",
 * etc. El usuario elige cada hora con un select 1-24h. Más claro y más
 * accesible móvil.
 */

interface Props {
  intervals: number[]; // horas, cada una entre 1 y 24
  onChange: (next: number[]) => void;
  disabled?: boolean;
  maxFollowups?: number; // default 5
}

const HOUR_CAP = 24;
const MIN_HOUR = 1;
const HOUR_OPTIONS = Array.from({ length: HOUR_CAP }, (_, i) => i + 1);

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 1;
  return Math.max(MIN_HOUR, Math.min(HOUR_CAP, Math.round(h)));
}

function sortAsc(arr: number[]): number[] {
  return arr.map(clampHour).slice().sort((a, b) => a - b);
}

function nextSuggestion(intervals: number[]): number {
  if (intervals.length === 0) return 6;
  const last = intervals[intervals.length - 1]!;
  return clampHour(last + 6);
}

export function IntervalsTimeline({
  intervals,
  onChange,
  disabled,
  maxFollowups = 5,
}: Props) {
  const sorted = sortAsc(intervals);

  function updateAt(originalIdx: number, newHour: number) {
    const next = sorted.slice();
    next[originalIdx] = clampHour(newHour);
    onChange(sortAsc(next));
  }

  function removeAt(originalIdx: number) {
    const next = sorted.slice();
    next.splice(originalIdx, 1);
    onChange(next);
  }

  function add() {
    if (sorted.length >= maxFollowups) return;
    onChange(sortAsc([...sorted, nextSuggestion(sorted)]));
  }

  return (
    <div className="flex flex-col gap-2 select-none">
      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
          Sin seguimientos programados todavía.
          <br />
          Pulsa <strong>"Añadir seguimiento"</strong> para programar el primero
          (recomendado: 6h, 12h y 20h tras el último mensaje del lead).
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sorted.map((hour, idx) => (
            <IntervalRow
              key={`row-${idx}-${hour}`}
              index={idx}
              hour={hour}
              disabled={disabled}
              onChangeHour={(h) => updateAt(idx, h)}
              onRemove={() => removeAt(idx)}
              isLast={sorted.length === 1}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px] text-muted-foreground">
          {sorted.length === 0
            ? 'Ningún mensaje programado'
            : `${sorted.length} ${sorted.length === 1 ? 'mensaje' : 'mensajes'} en las primeras ${sorted[sorted.length - 1]}h tras el último mensaje del lead`}
        </span>
        {!disabled && sorted.length < maxFollowups ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={add}
            className="h-7 text-xs"
          >
            <Plus className="size-3 mr-1" />
            Añadir seguimiento
          </Button>
        ) : null}
      </div>

      {sorted.length >= maxFollowups ? (
        <p className="text-[10px] text-muted-foreground italic">
          Máximo {maxFollowups} seguimientos por lead. Quita uno para añadir otro.
        </p>
      ) : null}
    </div>
  );
}

function IntervalRow({
  index,
  hour,
  disabled,
  onChangeHour,
  onRemove,
  isLast,
}: {
  index: number;
  hour: number;
  disabled?: boolean;
  onChangeHour: (h: number) => void;
  onRemove: () => void;
  isLast: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-mono uppercase text-warning px-1.5 py-0.5 rounded bg-warning/10 border border-warning/30 shrink-0">
          FU#{index + 1}
        </span>
        <span className="text-xs text-muted-foreground">enviar a las</span>
      </div>

      <Select
        value={String(hour)}
        onValueChange={(v) => onChangeHour(Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOUR_OPTIONS.map((h) => (
            <SelectItem key={h} value={String(h)} className="text-xs">
              {h} {h === 1 ? 'hora' : 'horas'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[11px] text-muted-foreground hidden sm:inline">
        tras último mensaje del lead
      </span>

      <div className="flex-1" />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        disabled={disabled || isLast}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        title={isLast ? 'Debe quedar al menos un seguimiento' : 'Eliminar este seguimiento'}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
