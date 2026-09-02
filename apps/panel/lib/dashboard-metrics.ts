/**
 * Sprint Lambda — KPIs del dashboard global.
 *
 * Calcula 7 cards top: Leads / Activas / Cualificados / Agendados / Ganados +
 * Show% / Close%. Cada KPI lleva valor actual + previo (mismo tamaño window
 * inmediatamente anterior) + delta en %.
 *
 * Sin deps de DB; el caller pasa eventos + snapshots de conversations ya
 * filtrados por window y por canal (si aplica).
 */

import {
  computeShowRate,
  computeCloseRate,
  type PipelineEvent,
  type RateMetric,
} from './pipeline-metrics';

export const KPI_MIN_EVENTS = 10;

export interface ConvSnapshot {
  id: number;
  state: string;
  is_qualified: boolean | null;
  phase_number: number;
  channel_id: number;
  direction: string;
  last_message_at: string | null;
  created_at: string;
  /**
   * Origen de la conversación (`conversations.conversation_source`):
   * 'bienvenida' | 'lm' | 'inbound' | 'manual' | null. Con `direction='outbound'`,
   * 'bienvenida' es una bienvenida (plantilla WA del formulario o frase de
   * bienvenida en IG/FB) y 'inbound' es que la entrenadora o su automatización
   * escribió primero con una palabra clave ("espalda", "información"). Opcional:
   * lo carga el dashboard; otros callers de este tipo no lo necesitan.
   */
  conversation_source?: string | null;
  /**
   * La persona ha escrito al menos un mensaje en la conversación. El loader del
   * dashboard lo calcula desde `conversation_messages`: las columnas
   * `first_lead_response_at` / `first_ai_message_at` existen en la tabla pero
   * nada las escribe (verificado 2026-09-02: 0 pobladas de 686 en el tenant 7).
   * Es lo que convierte en "respondida" una bienvenida o un outbound por palabra
   * clave. Opcional: solo se rellena donde el dashboard lo necesita.
   */
  has_lead_reply?: boolean;
}

export interface KpiValue {
  current: number;
  previous: number;
  deltaPct: number | null;
  deltaSign: 'up' | 'down' | 'flat';
  hasInsufficientData: boolean;
}

export interface RateKpiValue {
  current: number; // 0-1
  previous: number;
  deltaPct: number | null;
  deltaSign: 'up' | 'down' | 'flat';
  hasInsufficientData: boolean;
  numerator: number;
  denominator: number;
}

export interface KpiSnapshot {
  leads: KpiValue;
  active: KpiValue;
  qualified: KpiValue;
  scheduled: KpiValue;
  won: KpiValue;
  showRate: RateKpiValue;
  closeRate: RateKpiValue;
}

function toKpi(current: number, previous: number): KpiValue {
  const sign: 'up' | 'down' | 'flat' =
    current === previous ? 'flat' : current > previous ? 'up' : 'down';
  const deltaPct = previous > 0 ? (current - previous) / previous : null;
  return {
    current,
    previous,
    deltaPct,
    deltaSign: sign,
    hasInsufficientData: current < KPI_MIN_EVENTS && previous < KPI_MIN_EVENTS,
  };
}

function toRateKpi(currentMetric: RateMetric, prevMetric: RateMetric): RateKpiValue {
  const sign: 'up' | 'down' | 'flat' =
    currentMetric.rate === prevMetric.rate
      ? 'flat'
      : currentMetric.rate > prevMetric.rate
        ? 'up'
        : 'down';
  const deltaPct =
    prevMetric.rate > 0 ? (currentMetric.rate - prevMetric.rate) / prevMetric.rate : null;
  return {
    current: currentMetric.rate,
    previous: prevMetric.rate,
    deltaPct,
    deltaSign: sign,
    hasInsufficientData:
      currentMetric.denominator < KPI_MIN_EVENTS && prevMetric.denominator < KPI_MIN_EVENTS,
    numerator: currentMetric.numerator,
    denominator: currentMetric.denominator,
  };
}

function countLeads(convs: ConvSnapshot[]): number {
  return convs.length;
}

function countActive(convs: ConvSnapshot[], windowFromIso: string): number {
  const fromMs = Date.parse(windowFromIso);
  return convs.filter((c) => {
    if (c.state !== 'active') return false;
    if (!c.last_message_at) return false;
    return Date.parse(c.last_message_at) >= fromMs;
  }).length;
}

function countQualifiedFromEvents(events: PipelineEvent[]): number {
  // Cualificado = phase_change to F5 (propuesta) — el motor sube a F5 cuando is_qualified
  const ids = new Set<number>();
  for (const e of events) {
    if (e.event_type === 'phase_change' && e.to_value === '5') {
      ids.add(e.conversation_id);
    }
  }
  return ids.size;
}

function countScheduledFromEvents(events: PipelineEvent[]): number {
  // Agendado proxy = phase_change to F6 o F7
  const ids = new Set<number>();
  for (const e of events) {
    if (e.event_type === 'phase_change' && (e.to_value === '6' || e.to_value === '7')) {
      ids.add(e.conversation_id);
    }
  }
  return ids.size;
}

function countWonFromEvents(events: PipelineEvent[]): number {
  return events.filter(
    (e) => e.event_type === 'outcome_applied' && e.to_value === 'bought',
  ).length;
}

export function computeKpis(input: {
  currentEvents: PipelineEvent[];
  prevEvents: PipelineEvent[];
  currentConvs: ConvSnapshot[];
  prevConvs: ConvSnapshot[];
  currentWindowFromIso: string;
  prevWindowFromIso: string;
}): KpiSnapshot {
  return {
    leads: toKpi(countLeads(input.currentConvs), countLeads(input.prevConvs)),
    active: toKpi(
      countActive(input.currentConvs, input.currentWindowFromIso),
      countActive(input.prevConvs, input.prevWindowFromIso),
    ),
    qualified: toKpi(
      countQualifiedFromEvents(input.currentEvents),
      countQualifiedFromEvents(input.prevEvents),
    ),
    scheduled: toKpi(
      countScheduledFromEvents(input.currentEvents),
      countScheduledFromEvents(input.prevEvents),
    ),
    won: toKpi(countWonFromEvents(input.currentEvents), countWonFromEvents(input.prevEvents)),
    showRate: toRateKpi(
      computeShowRate(input.currentEvents),
      computeShowRate(input.prevEvents),
    ),
    closeRate: toRateKpi(
      computeCloseRate(input.currentEvents),
      computeCloseRate(input.prevEvents),
    ),
  };
}

/**
 * Devuelve un Close% promedio histórico para alertas (días con outcomes).
 * Si total outcomes <KPI_MIN_EVENTS devuelve null (no hay baseline confiable).
 */
export function computeHistoricCloseRate(events: PipelineEvent[]): number | null {
  const r = computeCloseRate(events);
  if (r.denominator < KPI_MIN_EVENTS) return null;
  return r.rate;
}

export function formatDelta(value: KpiValue | RateKpiValue): string {
  if (value.deltaPct == null) return '—';
  const pct = Math.abs(Math.round(value.deltaPct * 100));
  if (pct === 0) return '0%';
  return value.deltaSign === 'up' ? `↑${pct}%` : value.deltaSign === 'down' ? `↓${pct}%` : `${pct}%`;
}
