'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppointmentRow } from '@/lib/actions/calendars';
import { formatLeadName, statusDotColor } from './appointments-view';

interface Props {
  appointments: AppointmentRow[];
  onSelect: (a: AppointmentRow) => void;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABELS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function AppointmentsMonth({ appointments, onSelect }: Props) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const grid = useMemo(() => buildMonthGrid(anchor.year, anchor.month), [anchor]);
  const byDay = useMemo(() => groupByDay(appointments), [appointments]);

  const today = new Date();
  const todayKey = formatDayKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <h3 className="text-sm font-medium capitalize">
          {MONTH_LABELS[anchor.month]} {anchor.year}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setAnchor((a) => {
                const d = new Date(a.year, a.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const d = new Date();
              setAnchor({ year: d.getFullYear(), month: d.getMonth() });
            }}
          >
            Hoy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setAnchor((a) => {
                const d = new Date(a.year, a.month + 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-[10px] uppercase tracking-wider text-muted-foreground text-center py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 grid-rows-6 min-h-[560px]">
        {grid.map((cell) => {
          const key = formatDayKey(cell.year, cell.month, cell.day);
          const items = byDay.get(key) ?? [];
          const isCurrentMonth = cell.month === anchor.month;
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`border-b border-r p-1.5 flex flex-col gap-1 overflow-hidden transition-colors ${
                isToday
                  ? 'bg-primary/[0.04]'
                  : isCurrentMonth
                    ? 'bg-background hover:bg-muted/30'
                    : 'bg-muted/10'
              }`}
            >
              <span
                className={`text-[11px] font-medium leading-none inline-flex items-center justify-center w-5 h-5 ${
                  isToday
                    ? 'text-primary-foreground bg-primary rounded-full font-semibold'
                    : isCurrentMonth
                      ? 'text-foreground/70'
                      : 'text-muted-foreground/40'
                }`}
              >
                {cell.day}
              </span>
              <div className="flex flex-col gap-1 overflow-hidden">
                {items.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(a);
                    }}
                    className="group flex items-center gap-1.5 text-[11px] text-left rounded px-1.5 py-1 hover:bg-muted transition-colors border border-transparent hover:border-border/60"
                    title={`${formatLeadName(a)} · ${formatHour(a.startAt)}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${statusDotColor(a.appointmentStatus)}`}
                    />
                    <span className="font-medium text-muted-foreground tabular-nums shrink-0">
                      {formatHour(a.startAt)}
                    </span>
                    <span className="truncate text-foreground/90">
                      {formatLeadName(a)}
                    </span>
                  </button>
                ))}
                {items.length > 3 && (
                  <span className="text-[10px] text-muted-foreground/70 pl-1.5">
                    +{items.length - 3} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DayCell {
  year: number;
  month: number;
  day: number;
}

function buildMonthGrid(year: number, month: number): DayCell[] {
  // Lunes como primer día (ISO).
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // 0=Lun
  const start = new Date(year, month, 1 - firstWeekday);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
  }
  return cells;
}

function groupByDay(items: AppointmentRow[]): Map<string, AppointmentRow[]> {
  const map = new Map<string, AppointmentRow[]>();
  for (const a of items) {
    const d = new Date(a.startAt);
    const key = formatDayKey(d.getFullYear(), d.getMonth(), d.getDate());
    const arr = map.get(key) ?? [];
    arr.push(a);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }
  return map;
}

function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatHour(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
