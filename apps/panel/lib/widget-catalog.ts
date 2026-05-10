/**
 * Sprint Lambda.2 — Catálogo preset de métricas para widgets del dashboard.
 *
 * Cada métrica tiene:
 *   - key: identificador único (string, persistido en BD)
 *   - label: nombre mostrado al usuario
 *   - description: tooltip explicativo
 *   - category: 'volume' | 'rate' (determina formato de display)
 *   - compute: función pura que recibe events+convs+window y devuelve KpiValue/RateKpiValue
 *
 * Filtros opcionales por widget (filter_json en BD): { channel?: 'wa'|'fb'|'ig-in'|'ig-out' }.
 *
 * Sin deps de DB; el caller pasa events/convs ya filtrados por window y aplica
 * el filtro de canal del widget antes de invocar compute.
 */

import {
  type ConvSnapshot,
  type KpiValue,
  type RateKpiValue,
  KPI_MIN_EVENTS,
} from './dashboard-metrics';
import {
  computeShowRate,
  computeCloseRate,
  type PipelineEvent,
} from './pipeline-metrics';
import { classifyChannel, type ChannelKey, type ChannelInfo } from './dashboard-query';

export type WidgetCategory = 'volume' | 'rate';

export interface WidgetFilter {
  channel?: ChannelKey;
}

export interface WidgetMetricDef {
  key: string;
  label: string;
  description: string;
  category: WidgetCategory;
  // sólo para UI: indica si soporta filtro de canal (todas en este sprint sí)
  supportsChannel: boolean;
}

export interface WidgetComputeInput {
  currentEvents: PipelineEvent[];
  prevEvents: PipelineEvent[];
  currentConvs: ConvSnapshot[];
  prevConvs: ConvSnapshot[];
  currentWindowFromIso: string;
  prevWindowFromIso: string;
}

function toKpi(current: number, previous: number): KpiValue {
  const sign: 'up' | 'down' | 'flat' =
    current === previous ? 'flat' : current > previous ? 'up' : 'down';
  return {
    current,
    previous,
    deltaPct: previous > 0 ? (current - previous) / previous : null,
    deltaSign: sign,
    hasInsufficientData: current < KPI_MIN_EVENTS && previous < KPI_MIN_EVENTS,
  };
}

function toRateKpi(
  num: number,
  denom: number,
  prevNum: number,
  prevDenom: number,
): RateKpiValue {
  const current = denom > 0 ? num / denom : 0;
  const previous = prevDenom > 0 ? prevNum / prevDenom : 0;
  const sign: 'up' | 'down' | 'flat' =
    current === previous ? 'flat' : current > previous ? 'up' : 'down';
  return {
    current,
    previous,
    deltaPct: previous > 0 ? (current - previous) / previous : null,
    deltaSign: sign,
    hasInsufficientData: denom < KPI_MIN_EVENTS && prevDenom < KPI_MIN_EVENTS,
    numerator: num,
    denominator: denom,
  };
}

function countActive(convs: ConvSnapshot[], windowFromIso: string): number {
  const fromMs = Date.parse(windowFromIso);
  return convs.filter((c) => {
    if (c.state !== 'active') return false;
    if (!c.last_message_at) return false;
    return Date.parse(c.last_message_at) >= fromMs;
  }).length;
}

function distinctConvsByPhase(events: PipelineEvent[], targetPhases: string[]): number {
  const ids = new Set<number>();
  for (const e of events) {
    if (e.event_type !== 'phase_change') continue;
    if (!targetPhases.includes(e.to_value)) continue;
    ids.add(e.conversation_id);
  }
  return ids.size;
}

function countOutcome(events: PipelineEvent[], bucket: string): number {
  return events.filter(
    (e) => e.event_type === 'outcome_applied' && e.to_value === bucket,
  ).length;
}

// ----------------------------------------------------------------------------
// Catálogo de definiciones (metadata)
// ----------------------------------------------------------------------------

export const WIDGET_CATALOG: WidgetMetricDef[] = [
  {
    key: 'leads_total',
    label: 'Leads totales',
    description: 'Conversaciones nuevas creadas en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'convs_active',
    label: 'Conversaciones activas',
    description: 'state=active con mensaje reciente dentro del periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'qualified',
    label: 'Cualificados',
    description: 'Convs que el motor llevó a F5 (propuesta) en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'scheduled',
    label: 'Agendados',
    description: 'Convs con fase F6 (link agenda) o F7 (cita) en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'won',
    label: 'Ganados',
    description: 'Outcome "Comprado" aplicado en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'lost',
    label: 'Perdidos',
    description: 'Outcome "Cierre perdido" aplicado en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'no_show',
    label: 'No-Shows',
    description: 'Outcome "No-Show" aplicado en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'cancelled',
    label: 'Citas canceladas',
    description: 'Outcome "Cita cancelada" aplicado en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'recontact',
    label: 'Recontactos',
    description: 'Outcome "Recontacto" aplicado en el periodo.',
    category: 'volume',
    supportsChannel: true,
  },
  {
    key: 'qualification_rate',
    label: 'Tasa de cualificación',
    description: 'Cualificados / Leads totales en el periodo.',
    category: 'rate',
    supportsChannel: true,
  },
  {
    key: 'show_rate',
    label: 'Show% (asistencia)',
    description: '(won + lost) / (won + lost + cancelled + no_show). Mide la eficacia del recordatorio.',
    category: 'rate',
    supportsChannel: true,
  },
  {
    key: 'close_rate',
    label: 'Close% (cierre)',
    description: 'won / (won + lost). Mide la eficacia del cierre comercial.',
    category: 'rate',
    supportsChannel: true,
  },
];

export function getWidgetDef(key: string): WidgetMetricDef | undefined {
  return WIDGET_CATALOG.find((m) => m.key === key);
}

// ----------------------------------------------------------------------------
// Filtro por canal aplicado a inputs
// ----------------------------------------------------------------------------

function filterByChannel<T extends { channel_id: number; direction: string }>(
  items: T[],
  filter: WidgetFilter | null | undefined,
  channelMap: Map<number, ChannelInfo>,
): T[] {
  if (!filter?.channel) return items;
  return items.filter(
    (it) => classifyChannel(channelMap.get(it.channel_id), it.direction) === filter.channel,
  );
}

function filterEventsByChannel(
  events: PipelineEvent[],
  filter: WidgetFilter | null | undefined,
  convs: ConvSnapshot[],
  channelMap: Map<number, ChannelInfo>,
): PipelineEvent[] {
  if (!filter?.channel) return events;
  const targetChannel = filter.channel;
  const eligibleConvIds = new Set<number>();
  for (const c of convs) {
    if (classifyChannel(channelMap.get(c.channel_id), c.direction) === targetChannel) {
      eligibleConvIds.add(c.id);
    }
  }
  return events.filter((e) => eligibleConvIds.has(e.conversation_id));
}

// ----------------------------------------------------------------------------
// Compute por métrica
// ----------------------------------------------------------------------------

export type ComputedWidgetValue =
  | { category: 'volume'; value: KpiValue }
  | { category: 'rate'; value: RateKpiValue };

export function computeWidget(
  metricKey: string,
  filter: WidgetFilter | null | undefined,
  input: WidgetComputeInput,
  channelMap: Map<number, ChannelInfo>,
  // currentConvsForChannelEvents: convs del periodo actual filtradas a canal,
  // para mapear eventos al canal correctamente. Si no se pasa, se calcula.
): ComputedWidgetValue {
  const def = getWidgetDef(metricKey);
  if (!def) {
    return {
      category: 'volume',
      value: {
        current: 0,
        previous: 0,
        deltaPct: null,
        deltaSign: 'flat',
        hasInsufficientData: true,
      },
    };
  }

  const curConvs = filterByChannel(input.currentConvs, filter, channelMap);
  const prevConvs = filterByChannel(input.prevConvs, filter, channelMap);
  const curEvents = filterEventsByChannel(
    input.currentEvents,
    filter,
    [...input.currentConvs, ...input.prevConvs],
    channelMap,
  );
  const prevEvents = filterEventsByChannel(
    input.prevEvents,
    filter,
    [...input.currentConvs, ...input.prevConvs],
    channelMap,
  );

  switch (metricKey) {
    case 'leads_total':
      return { category: 'volume', value: toKpi(curConvs.length, prevConvs.length) };
    case 'convs_active':
      return {
        category: 'volume',
        value: toKpi(
          countActive(curConvs, input.currentWindowFromIso),
          countActive(prevConvs, input.prevWindowFromIso),
        ),
      };
    case 'qualified':
      return {
        category: 'volume',
        value: toKpi(
          distinctConvsByPhase(curEvents, ['5']),
          distinctConvsByPhase(prevEvents, ['5']),
        ),
      };
    case 'scheduled':
      return {
        category: 'volume',
        value: toKpi(
          distinctConvsByPhase(curEvents, ['6', '7']),
          distinctConvsByPhase(prevEvents, ['6', '7']),
        ),
      };
    case 'won':
      return {
        category: 'volume',
        value: toKpi(countOutcome(curEvents, 'bought'), countOutcome(prevEvents, 'bought')),
      };
    case 'lost':
      return {
        category: 'volume',
        value: toKpi(countOutcome(curEvents, 'lost'), countOutcome(prevEvents, 'lost')),
      };
    case 'no_show':
      return {
        category: 'volume',
        value: toKpi(countOutcome(curEvents, 'no_show'), countOutcome(prevEvents, 'no_show')),
      };
    case 'cancelled':
      return {
        category: 'volume',
        value: toKpi(countOutcome(curEvents, 'cancelled'), countOutcome(prevEvents, 'cancelled')),
      };
    case 'recontact':
      return {
        category: 'volume',
        value: toKpi(countOutcome(curEvents, 'recontact'), countOutcome(prevEvents, 'recontact')),
      };
    case 'qualification_rate': {
      const curQ = distinctConvsByPhase(curEvents, ['5']);
      const prevQ = distinctConvsByPhase(prevEvents, ['5']);
      return {
        category: 'rate',
        value: toRateKpi(curQ, curConvs.length, prevQ, prevConvs.length),
      };
    }
    case 'show_rate': {
      const cur = computeShowRate(curEvents);
      const prev = computeShowRate(prevEvents);
      return {
        category: 'rate',
        value: toRateKpi(cur.numerator, cur.denominator, prev.numerator, prev.denominator),
      };
    }
    case 'close_rate': {
      const cur = computeCloseRate(curEvents);
      const prev = computeCloseRate(prevEvents);
      return {
        category: 'rate',
        value: toRateKpi(cur.numerator, cur.denominator, prev.numerator, prev.denominator),
      };
    }
    default:
      return {
        category: 'volume',
        value: {
          current: 0,
          previous: 0,
          deltaPct: null,
          deltaSign: 'flat',
          hasInsufficientData: true,
        },
      };
  }
}
