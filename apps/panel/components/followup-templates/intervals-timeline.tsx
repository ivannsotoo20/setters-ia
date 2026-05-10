'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  intervals: number[]; // horas, cada uno entre 1 y 24, ordenadas asc
  onChange: (next: number[]) => void;
  disabled?: boolean;
  maxFollowups?: number; // default 5
}

const HOUR_CAP = 24;
const MIN_HOUR = 1;

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 1;
  return Math.max(MIN_HOUR, Math.min(HOUR_CAP, Math.round(h)));
}

function sortUnique(arr: number[]): number[] {
  return Array.from(new Set(arr.map(clampHour))).sort((a, b) => a - b);
}

export function IntervalsTimeline({
  intervals,
  onChange,
  disabled,
  maxFollowups = 5,
}: Props) {
  const sorted = sortUnique(intervals);

  function updateAt(idx: number, newHour: number) {
    const next = sorted.slice();
    next[idx] = clampHour(newHour);
    onChange(sortUnique(next));
  }

  function removeAt(idx: number) {
    const next = sorted.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function add(hour: number) {
    if (sorted.length >= maxFollowups) return;
    onChange(sortUnique([...sorted, hour]));
  }

  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Lead responde</span>
        <span>Cap 24h (límite Meta/GHL)</span>
      </div>

      {/* Track */}
      <div className="relative h-12 rounded-md border border-border/40 bg-muted/20">
        {/* Línea base */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="h-px w-full bg-border/40" />
        </div>
        {/* Marker inicio */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2">
          <div className="size-2.5 rounded-full bg-emerald-500" />
        </div>
        {/* Marker fin */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
          <div className="size-2.5 rounded-full bg-rose-500/70" />
        </div>

        {/* Chips intervals */}
        {sorted.map((h, idx) => {
          const leftPct = (h / HOUR_CAP) * 100;
          return (
            <ChipMarker
              key={`${idx}-${h}`}
              hour={h}
              index={idx}
              leftPct={leftPct}
              disabled={disabled}
              onChange={(newHour) => updateAt(idx, newHour)}
              onRemove={() => removeAt(idx)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          {sorted.length === 0
            ? 'Sin seguimientos programados'
            : `${sorted.length} ${sorted.length === 1 ? 'mensaje' : 'mensajes'} en ${sorted[sorted.length - 1]}h`}
        </span>
        {!disabled && sorted.length < maxFollowups ? (
          <AddChipButton currentMax={sorted[sorted.length - 1] ?? 0} onAdd={add} />
        ) : null}
      </div>

      {sorted.length === 0 && !disabled ? (
        <p className="text-[10px] text-muted-foreground italic">
          Pulsa "Añadir" para programar el primer seguimiento (recomendado: 6h, 12h, 20h).
        </p>
      ) : null}
    </div>
  );
}

function ChipMarker({
  hour,
  index,
  leftPct,
  disabled,
  onChange,
  onRemove,
}: {
  hour: number;
  index: number;
  leftPct: number;
  disabled?: boolean;
  onChange: (h: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(hour));

  function commit() {
    const v = Number(draft);
    if (Number.isFinite(v) && v >= MIN_HOUR && v <= HOUR_CAP) {
      onChange(v);
      setOpen(false);
    }
  }

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
      style={{ left: `${leftPct}%` }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'group flex flex-col items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed',
            )}
          >
            <div className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-500 whitespace-nowrap group-hover:bg-amber-500/25">
              FU#{index + 1} · {hour}h
            </div>
            <div className="size-2 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Seguimiento #{index + 1}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs">
              Horas tras el último mensaje del lead{' '}
              <span className="text-muted-foreground">(1-24)</span>
            </label>
            <Input
              type="number"
              min={MIN_HOUR}
              max={HOUR_CAP}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
              autoFocus
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="text-rose-500 hover:text-rose-600"
            >
              <X className="size-3 mr-1" />
              Eliminar
            </Button>
            <Button size="sm" onClick={commit}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddChipButton({
  currentMax,
  onAdd,
}: {
  currentMax: number;
  onAdd: (h: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(Math.min(HOUR_CAP, currentMax + 6)));

  function commit() {
    const v = Number(draft);
    if (Number.isFinite(v) && v >= MIN_HOUR && v <= HOUR_CAP) {
      onAdd(v);
      setOpen(false);
      setDraft(String(Math.min(HOUR_CAP, v + 6)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Plus className="size-3 mr-1" />
          Añadir seguimiento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Nuevo seguimiento</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label className="text-xs">
            Horas tras el último mensaje del lead{' '}
            <span className="text-muted-foreground">(1-24)</span>
          </label>
          <Input
            type="number"
            min={MIN_HOUR}
            max={HOUR_CAP}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button size="sm" onClick={commit}>
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
