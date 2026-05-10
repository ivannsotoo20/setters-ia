'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LabelRow } from '@/lib/actions/labels';

interface Member {
  userId: string;
  email: string;
  fullName: string | null;
}

interface Props {
  q: string;
  assignee: string;
  labelIds: number[];
  windowKey: 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';
  fromIso: string;
  toIso: string;
  members: Member[];
  customLabels: LabelRow[];
  viewerId: string;
}

const WINDOW_OPTIONS: Array<{ value: Props['windowKey']; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes anterior' },
  { value: 'custom', label: 'Personalizado' },
];

export function PipelineFilters({
  q: initialQ,
  assignee,
  labelIds,
  windowKey,
  fromIso,
  toIso,
  members,
  customLabels,
  viewerId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [, startTransition] = useTransition();

  // Debounce q en URL
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set('q', q.trim());
      else params.delete('q');
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setLabelIds(next: number[]) {
    if (next.length === 0) setParam('labels', null);
    else setParam('labels', next.join(','));
  }

  function toggleLabel(id: number) {
    const next = labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id];
    setLabelIds(next);
  }

  const hasActiveFilters =
    q.length > 0 || assignee !== 'all' || labelIds.length > 0 || windowKey !== '30d';

  function reset() {
    const params = new URLSearchParams();
    const p = searchParams.get('p');
    if (p) params.set('p', p);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setQ('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar lead…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Assignee */}
      <Select value={assignee} onValueChange={(v) => setParam('assignee', v === 'all' ? null : v)}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="Asignación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="me">Mis leads</SelectItem>
          <SelectItem value="unassigned">Sin asignar</SelectItem>
          {members.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.fullName ?? m.email}
                  {m.userId === viewerId ? ' (yo)' : ''}
                </SelectItem>
              ))}
            </>
          ) : null}
        </SelectContent>
      </Select>

      {/* Time window */}
      <Select value={windowKey} onValueChange={(v) => setParam('w', v === '30d' ? null : v)}>
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom date range (solo si windowKey=custom) */}
      {windowKey === 'custom' ? (
        <>
          <Input
            type="date"
            value={fromIso ? fromIso.slice(0, 10) : ''}
            onChange={(e) => setParam('from', e.target.value || null)}
            className="h-8 w-[140px] text-xs"
            aria-label="Desde"
          />
          <Input
            type="date"
            value={toIso ? toIso.slice(0, 10) : ''}
            onChange={(e) => setParam('to', e.target.value || null)}
            className="h-8 w-[140px] text-xs"
            aria-label="Hasta"
          />
        </>
      ) : null}

      {/* Labels custom */}
      {customLabels.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              Etiquetas {labelIds.length > 0 ? `(${labelIds.length})` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>Filtrar por etiqueta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {customLabels.map((l) => (
              <DropdownMenuCheckboxItem
                key={l.id}
                checked={labelIds.includes(l.id)}
                onCheckedChange={() => toggleLabel(l.id)}
              >
                <span
                  className="inline-block size-2 rounded-full mr-1.5"
                  style={{ backgroundColor: l.color }}
                />
                {l.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset}>
          <X className="size-3 mr-1" />
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}
