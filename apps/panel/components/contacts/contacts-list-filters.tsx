'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, ChevronDown, FilterX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LabelRow } from '@/lib/actions/labels';
import type { MemberRow } from '@/lib/actions/members';
import {
  countActiveFilters,
  type LeadFilterParams,
} from '@/lib/lead-list-query';

interface Props {
  filters: LeadFilterParams;
  allLabels: LabelRow[];
  members: MemberRow[];
  triggers: string[];
  viewerId: string;
}

const CHANNELS: { key: string; label: string }[] = [
  { key: 'wa', label: 'WhatsApp' },
  { key: 'ig', label: 'Instagram' },
  { key: 'fb', label: 'Facebook' },
];

const PROVIDERS: { key: string; label: string }[] = [
  { key: 'manychat', label: 'ManyChat' },
  { key: 'ycloud', label: 'YCloud' },
  { key: 'meta_cloud', label: 'Meta Cloud' },
  { key: 'ghl', label: 'GHL' },
  { key: 'other', label: 'Otro' },
];

const PHASES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const STATES: { key: string; label: string }[] = [
  { key: 'active', label: 'Activa' },
  { key: 'paused', label: 'Pausada' },
  { key: 'closed', label: 'Cerrada' },
  { key: 'stopped', label: 'Detenida' },
];

const QUALIFIED_OPTS: { key: 'all' | 'yes' | 'no' | 'undecided'; label: string }[] = [
  { key: 'all', label: 'Cualquiera' },
  { key: 'yes', label: 'Cualificado' },
  { key: 'no', label: 'No cualificado' },
  { key: 'undecided', label: 'Sin decidir' },
];

const HANDOFF_CAUSES: { key: string; label: string }[] = [
  { key: 'A_agenda', label: 'A · Agenda' },
  { key: 'B_derivacion', label: 'B · Derivación' },
  { key: 'C_descualificado', label: 'C · Descualificado' },
  { key: 'D_espera', label: 'D · Espera' },
  { key: 'E_error', label: 'E · Error' },
];

type DatePresetKey = '' | 'today' | '7d' | '30d' | 'thisMonth' | 'custom';

interface DatePresetOption {
  key: DatePresetKey;
  label: string;
}

const CREATED_PRESETS: DatePresetOption[] = [
  { key: '', label: 'Cualquiera' },
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7d' },
  { key: '30d', label: 'Últimos 30d' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'custom', label: 'Personalizado' },
];

const LAST_MSG_PRESETS: DatePresetOption[] = [
  { key: '', label: 'Cualquiera' },
  { key: '7d', label: 'Últimos 7d' },
  { key: '30d', label: 'Últimos 30d' },
];

function presetToRange(key: DatePresetKey, now: Date = new Date()): { from: string; to: string } | null {
  if (!key || key === 'custom') return null;
  const to = new Date(now);
  const from = new Date(now);
  switch (key) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case 'thisMonth':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    default:
      return null;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Sprint Mu — Filter pane lateral con 6 grupos colapsables. Patrón heredado
 * de pipeline-filters: query params como source of truth, debounce 250ms en
 * search, click-outside para dropdowns custom.
 *
 * Diseño "6 expertos":
 *  1. Fuente — origen del lead
 *  2. Pipeline — fase, estado, cualificación, handoff
 *  3. Etiquetas — system + custom
 *  4. Asignación — quién atiende
 *  5. Tiempo — creación + último mensaje
 *  6. Estado IA — IA on/off, bloqueado, cita programada
 */
export function ContactsListFilters({
  filters,
  allLabels,
  members,
  triggers,
  viewerId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState(filters.q ?? '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSearchValue(filters.q ?? '');
  }, [filters.q]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setManyParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam('q', value.length > 0 ? value : null);
    }, 250);
  };

  const toggleMulti = (key: string, value: string, current: string[]) => {
    const set = new Set(current);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const arr = Array.from(set);
    setParam(key, arr.length > 0 ? arr.join(',') : null);
  };

  const toggleMultiInt = (key: string, value: number, current: number[]) => {
    const set = new Set(current);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const arr = Array.from(set).sort((a, b) => a - b);
    setParam(key, arr.length > 0 ? arr.join(',') : null);
  };

  const clearAll = () => {
    router.replace(pathname, { scroll: false });
  };

  // Date presets
  const onCreatedPreset = (key: DatePresetKey) => {
    if (!key) {
      setManyParams({ createdW: null, createdFrom: null, createdTo: null });
      return;
    }
    if (key === 'custom') {
      setParam('createdW', 'custom');
      return;
    }
    const range = presetToRange(key);
    setManyParams({
      createdW: key,
      createdFrom: range?.from ?? null,
      createdTo: range?.to ?? null,
    });
  };

  const onLastMsgPreset = (key: DatePresetKey | 'never') => {
    if (key === '' as DatePresetKey) {
      setManyParams({ lastMsgW: null, lastMsgFrom: null, lastMsgTo: null });
      return;
    }
    if (key === 'never') {
      setManyParams({
        lastMsgW: 'never',
        lastMsgFrom: null,
        lastMsgTo: null,
      });
      return;
    }
    const range = presetToRange(key as DatePresetKey);
    setManyParams({
      lastMsgW: key as string,
      lastMsgFrom: range?.from ?? null,
      lastMsgTo: range?.to ?? null,
    });
  };

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const channels = filters.channels ?? [];
  const providers = filters.providers ?? [];
  const triggersFilter = filters.triggers ?? [];
  const phases = filters.phases ?? [];
  const states = filters.states ?? [];
  const qualified = filters.qualified ?? 'all';
  const handoffCauses = filters.handoffCauses ?? [];
  const labelIds = filters.labelIds ?? [];
  const assignee = filters.assignee ?? 'any';
  const createdW = (searchParams.get('createdW') ?? '') as DatePresetKey;
  const lastMsgWParam = searchParams.get('lastMsgW') ?? '';
  const aiState = filters.aiState ?? 'all';
  const blocked = filters.blocked ?? 'all';
  const scheduled = filters.scheduled ?? 'all';

  return (
    <aside className="flex flex-col h-full min-h-0 bg-card/40 border-r border-border w-64 shrink-0">
      {/* Header */}
      <header className="border-b border-border px-3 py-2.5 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Filtros
          </h2>
          {activeCount > 0 ? (
            <p className="text-[10px] text-primary mt-0.5">
              {activeCount} activo{activeCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-7 gap-1 text-[11px]"
          >
            <FilterX className="size-3" />
            Limpiar
          </Button>
        ) : null}
      </header>

      {/* Search libre */}
      <div className="px-3 py-2.5 border-b border-border">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Nombre, teléfono, email…"
            className="pl-8 h-8 text-sm"
          />
          {searchValue.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Grupos colapsables */}
      <div className="flex-1 overflow-y-auto">
        {/* 1. Fuente */}
        <FilterGroup label="Fuente" defaultOpen>
          <FilterSubLabel>Canal</FilterSubLabel>
          <ChipRow>
            {CHANNELS.map((c) => (
              <FilterChip
                key={c.key}
                label={c.label}
                active={channels.includes(c.key)}
                onClick={() => toggleMulti('channels', c.key, channels)}
              />
            ))}
          </ChipRow>
          <FilterSubLabel>Proveedor</FilterSubLabel>
          <ChipRow>
            {PROVIDERS.map((p) => (
              <FilterChip
                key={p.key}
                label={p.label}
                active={providers.includes(p.key)}
                onClick={() => toggleMulti('providers', p.key, providers)}
              />
            ))}
          </ChipRow>
          {triggers.length > 0 ? (
            <>
              <FilterSubLabel>Origen</FilterSubLabel>
              <ChipRow>
                {triggers.map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={triggersFilter.includes(t)}
                    onClick={() => toggleMulti('triggers', t, triggersFilter)}
                  />
                ))}
              </ChipRow>
            </>
          ) : null}
        </FilterGroup>

        {/* 2. Pipeline */}
        <FilterGroup label="Pipeline">
          <FilterSubLabel>Fase</FilterSubLabel>
          <ChipRow>
            {PHASES.map((p) => (
              <FilterChip
                key={p}
                label={`F${p}`}
                active={phases.includes(p)}
                onClick={() => toggleMultiInt('phases', p, phases)}
              />
            ))}
          </ChipRow>
          <FilterSubLabel>Estado</FilterSubLabel>
          <ChipRow>
            {STATES.map((s) => (
              <FilterChip
                key={s.key}
                label={s.label}
                active={states.includes(s.key)}
                onClick={() => toggleMulti('states', s.key, states)}
              />
            ))}
          </ChipRow>
          <FilterSubLabel>Cualificado</FilterSubLabel>
          <ChipRow>
            {QUALIFIED_OPTS.map((q) => (
              <FilterChip
                key={q.key}
                label={q.label}
                active={qualified === q.key}
                onClick={() => setParam('qualified', q.key === 'all' ? null : q.key)}
              />
            ))}
          </ChipRow>
          <FilterSubLabel>Causa handoff</FilterSubLabel>
          <ChipRow>
            {HANDOFF_CAUSES.map((h) => (
              <FilterChip
                key={h.key}
                label={h.label}
                active={handoffCauses.includes(h.key)}
                onClick={() => toggleMulti('handoff', h.key, handoffCauses)}
              />
            ))}
          </ChipRow>
        </FilterGroup>

        {/* 3. Etiquetas */}
        {allLabels.length > 0 ? (
          <FilterGroup label="Etiquetas">
            <ul className="flex flex-col gap-0.5 px-2 py-1">
              {allLabels.map((l) => {
                const active = labelIds.includes(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => toggleMultiInt('labels', l.id, labelIds)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] text-left',
                        active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      {active ? <X className="size-3 text-primary shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </FilterGroup>
        ) : null}

        {/* 4. Asignación */}
        <FilterGroup label="Asignación">
          <ChipRow>
            <FilterChip
              label="Cualquiera"
              active={assignee === 'any'}
              onClick={() => setParam('assignee', null)}
            />
            <FilterChip
              label="Mío"
              active={assignee === 'mine'}
              onClick={() => setParam('assignee', 'mine')}
            />
            <FilterChip
              label="Sin asignar"
              active={assignee === 'unassigned'}
              onClick={() => setParam('assignee', 'unassigned')}
            />
          </ChipRow>
          {members.length > 0 ? (
            <select
              value={
                assignee !== 'any' && assignee !== 'mine' && assignee !== 'unassigned'
                  ? assignee
                  : ''
              }
              onChange={(e) => setParam('assignee', e.target.value === '' ? null : e.target.value)}
              className="mt-2 w-full h-8 rounded-md border border-border bg-background text-sm px-2"
            >
              <option value="">Miembro específico…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName ?? m.email}
                  {m.userId === viewerId ? ' (yo)' : ''}
                </option>
              ))}
            </select>
          ) : null}
        </FilterGroup>

        {/* 5. Tiempo */}
        <FilterGroup label="Tiempo">
          <FilterSubLabel>Creación del lead</FilterSubLabel>
          <ChipRow>
            {CREATED_PRESETS.map((p) => (
              <FilterChip
                key={p.key || 'any'}
                label={p.label}
                active={(createdW || '') === p.key}
                onClick={() => onCreatedPreset(p.key)}
              />
            ))}
          </ChipRow>
          {createdW === 'custom' ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <div>
                <label className="text-[10px] text-muted-foreground">Desde</label>
                <Input
                  type="date"
                  value={(filters.createdFrom ?? '').slice(0, 10)}
                  onChange={(e) =>
                    setParam(
                      'createdFrom',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Hasta</label>
                <Input
                  type="date"
                  value={(filters.createdTo ?? '').slice(0, 10)}
                  onChange={(e) =>
                    setParam(
                      'createdTo',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : null}
          <FilterSubLabel>Último mensaje</FilterSubLabel>
          <ChipRow>
            {LAST_MSG_PRESETS.map((p) => (
              <FilterChip
                key={p.key || 'any'}
                label={p.label}
                active={lastMsgWParam === p.key}
                onClick={() => onLastMsgPreset(p.key)}
              />
            ))}
            <FilterChip
              label="Nunca respondió"
              active={lastMsgWParam === 'never'}
              onClick={() => onLastMsgPreset('never')}
            />
          </ChipRow>
        </FilterGroup>

        {/* 6. Estado IA */}
        <FilterGroup label="Estado IA">
          <FilterSubLabel>IA</FilterSubLabel>
          <ChipRow>
            <FilterChip
              label="Cualquiera"
              active={aiState === 'all'}
              onClick={() => setParam('aiState', null)}
            />
            <FilterChip
              label="Activa"
              active={aiState === 'active'}
              onClick={() => setParam('aiState', 'active')}
            />
            <FilterChip
              label="Pausada"
              active={aiState === 'paused'}
              onClick={() => setParam('aiState', 'paused')}
            />
          </ChipRow>
          <FilterSubLabel>Bloqueado</FilterSubLabel>
          <ChipRow>
            <FilterChip
              label="Cualquiera"
              active={blocked === 'all'}
              onClick={() => setParam('blocked', null)}
            />
            <FilterChip
              label="Sí"
              active={blocked === 'yes'}
              onClick={() => setParam('blocked', 'yes')}
            />
            <FilterChip
              label="No"
              active={blocked === 'no'}
              onClick={() => setParam('blocked', 'no')}
            />
          </ChipRow>
          <FilterSubLabel>Cita programada</FilterSubLabel>
          <ChipRow>
            <FilterChip
              label="Cualquiera"
              active={scheduled === 'all'}
              onClick={() => setParam('scheduled', null)}
            />
            <FilterChip
              label="Sí"
              active={scheduled === 'yes'}
              onClick={() => setParam('scheduled', 'yes')}
            />
            <FilterChip
              label="No"
              active={scheduled === 'no'}
              onClick={() => setParam('scheduled', 'no')}
            />
          </ChipRow>
        </FilterGroup>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function FilterGroup({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="border-b border-border" open={defaultOpen}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground hover:text-foreground flex items-center justify-between">
        <span>{label}</span>
        <ChevronDown className="size-3 transition-transform [details[open]_&]:rotate-180" />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

function FilterSubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium text-muted-foreground mt-2 mb-1.5 uppercase tracking-wide">
      {children}
    </p>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-6 rounded-full px-2.5 text-[11px] font-medium border transition-colors',
        active
          ? 'border-primary/60 bg-primary/15 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {label}
    </button>
  );
}
