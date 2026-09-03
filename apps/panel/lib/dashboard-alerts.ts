/**
 * Sprint Lambda — Alertas inteligentes del dashboard.
 *
 * Evalúa 6 reglas:
 *   1. WoW change ≥15% en KPIs core (con min 10 events por lado)
 *   2. Sin respuesta de la persona, por (canal × fase) — ≥5 conversaciones
 *      cuyo último mensaje es del setter y lleva ≥3 días sin contestación
 *   3. Esperando respuesta — ≥1 persona cuyo último mensaje lleva >2 h sin
 *      que nadie le conteste (critical)
 *   4. Handoffs sin atender — ≥1 conversación en manos de la entrenadora con
 *      >24 h sin mensaje suyo (warning)
 *   5. Tasa cierre baja vs histórico (<50% del promedio 60d)
 *   6. Surge de no-shows (≥3× media diaria, count abs ≥3)
 *
 * Devuelve max 5 alertas ordenadas por severity weight.
 */

import type { KpiSnapshot } from './dashboard-metrics';
import type { ChannelKey, StallInput, WaitingResult } from './dashboard-query';
import type { PipelineEvent } from './pipeline-metrics';

export const ALERT_THRESHOLDS = {
  wowMinEvents: 10,
  wowMinChangePct: 0.15,
  bottleneckMinCount: 5,
  bottleneckMinDays: 3,
  awaitingReplyMinHours: 2,
  handoffUnattendedMinHours: 24,
  closeRateBaselineDropFraction: 0.5, // 50% caída vs histórico
  closeRateMinOutcomes: 10,
  noShowMinAbsolute: 3,
  noShowSurgeMultiplier: 3,
} as const;

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  type:
    | 'wow_change'
    | 'bottleneck'
    | 'awaiting_reply'
    | 'handoff_unattended'
    | 'low_close_rate'
    | 'noshow_surge';
  severity: AlertSeverity;
  message: string;
  channel?: ChannelKey;
  metric?: string;
  weight: number;
}

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  critical: 100,
  warning: 50,
  info: 10,
};

const PHASE_LABELS: Record<number, string> = {
  1: 'F1 (apertura)',
  2: 'F2 (profundizar)',
  3: 'F3 (cualificación)',
  4: 'F4 (puente)',
  5: 'F5 (propuesta)',
  6: 'F6 (link agenda)',
};

const CHANNEL_LABELS_ES: Record<ChannelKey, string> = {
  wa: 'WhatsApp',
  fb: 'Facebook',
  'ig-in': 'Instagram inbound',
  'ig-out': 'Instagram outbound',
};

const KPI_LABELS_ES: Record<string, string> = {
  leads: 'leads totales',
  active: 'conversaciones activas',
  qualified: 'cualificaciones',
  scheduled: 'agendas',
  won: 'cierres ganados',
};

function wowChangeAlert(
  metric: keyof KpiSnapshot,
  current: number,
  previous: number,
): Alert | null {
  if (current < ALERT_THRESHOLDS.wowMinEvents || previous < ALERT_THRESHOLDS.wowMinEvents) {
    return null;
  }
  if (previous === 0) return null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < ALERT_THRESHOLDS.wowMinChangePct) return null;

  const isDrop = change < 0;
  const pct = Math.abs(Math.round(change * 100));
  const label = KPI_LABELS_ES[metric] ?? String(metric);
  const arrow = isDrop ? '↓' : '↑';
  return {
    id: `wow_${metric}_${isDrop ? 'down' : 'up'}`,
    type: 'wow_change',
    severity: isDrop ? 'warning' : 'info',
    message: `${arrow} Las ${label} ${isDrop ? 'cayeron' : 'subieron'} ${pct}% vs el periodo anterior`,
    metric: String(metric),
    weight: SEVERITY_WEIGHT[isDrop ? 'warning' : 'info'] + pct,
  };
}

/**
 * "Sin respuesta de la persona" (sustituye al bottleneck por fecha de cambio
 * de fase, 2026-09-03). El grupo ya viene filtrado por `detectStalls`; aquí
 * solo se aplican los umbrales y se redacta.
 */
function stallAlert(s: StallInput): Alert | null {
  if (s.count < ALERT_THRESHOLDS.bottleneckMinCount) return null;
  if (s.daysStuckMin < ALERT_THRESHOLDS.bottleneckMinDays) return null;
  const severity: AlertSeverity = s.count >= 10 ? 'warning' : 'info';
  return {
    id: `bottleneck_${s.channel}_${s.phase}`,
    type: 'bottleneck',
    severity,
    message: `${s.count} personas de ${CHANNEL_LABELS_ES[s.channel]} llevan más de ${s.daysStuckMin} días sin contestar en ${PHASE_LABELS[s.phase] ?? `F${s.phase}`}`,
    channel: s.channel,
    weight: SEVERITY_WEIGHT[severity] + s.count,
  };
}

/** Una sola persona sin atender ya es critical: es un lead esperando. */
function awaitingReplyAlert(r: WaitingResult): Alert | null {
  if (r.count < 1) return null;
  const message =
    r.count === 1
      ? '1 persona está esperando respuesta y nadie le ha contestado'
      : `${r.count} personas están esperando respuesta y nadie les ha contestado`;
  return {
    id: 'awaiting_reply',
    type: 'awaiting_reply',
    severity: 'critical',
    message,
    metric: 'awaitingReply',
    weight: SEVERITY_WEIGHT.critical + r.count,
  };
}

function handoffUnattendedAlert(r: WaitingResult): Alert | null {
  if (r.count < 1) return null;
  const hours = ALERT_THRESHOLDS.handoffUnattendedMinHours;
  const message =
    r.count === 1
      ? `1 conversación lleva más de ${hours} h en manos de la entrenadora sin respuesta`
      : `${r.count} conversaciones llevan más de ${hours} h en manos de la entrenadora sin respuesta`;
  return {
    id: 'handoff_unattended',
    type: 'handoff_unattended',
    severity: 'warning',
    message,
    metric: 'handoffUnattended',
    weight: SEVERITY_WEIGHT.warning + r.count,
  };
}

function lowCloseRateAlert(input: {
  currentRate: number;
  currentDenom: number;
  baselineRate: number | null;
}): Alert | null {
  if (input.baselineRate == null) return null;
  if (input.currentDenom < ALERT_THRESHOLDS.closeRateMinOutcomes) return null;
  if (input.baselineRate === 0) return null;
  const dropFraction = (input.baselineRate - input.currentRate) / input.baselineRate;
  if (dropFraction < ALERT_THRESHOLDS.closeRateBaselineDropFraction) return null;
  const currentPct = Math.round(input.currentRate * 100);
  const baselinePct = Math.round(input.baselineRate * 100);
  return {
    id: `low_close_rate`,
    type: 'low_close_rate',
    severity: 'warning',
    message: `Tasa de cierre bajó al ${currentPct}% (vs ${baselinePct}% promedio histórico)`,
    metric: 'closeRate',
    weight: SEVERITY_WEIGHT.warning + Math.round(dropFraction * 100),
  };
}

function noShowSurgeAlert(input: {
  currentCount: number;
  windowDays: number;
  historicEvents: PipelineEvent[];
}): Alert | null {
  if (input.currentCount < ALERT_THRESHOLDS.noShowMinAbsolute) return null;
  // Calcular media diaria histórica (últimos 60d excluyendo periodo actual)
  const noShowsHistoric = input.historicEvents.filter(
    (e) => e.event_type === 'outcome_applied' && e.to_value === 'no_show',
  ).length;
  const histDailyAvg = noShowsHistoric / 60;
  const expected = histDailyAvg * input.windowDays;
  if (expected === 0) {
    // Sin baseline → solo alerta si abs >= 5 (umbral más alto)
    if (input.currentCount < 5) return null;
    return {
      id: 'noshow_surge_no_baseline',
      type: 'noshow_surge',
      severity: 'warning',
      message: `${input.currentCount} no-shows en este periodo`,
      metric: 'noShow',
      weight: SEVERITY_WEIGHT.warning + input.currentCount,
    };
  }
  if (input.currentCount < expected * ALERT_THRESHOLDS.noShowSurgeMultiplier) return null;
  const ratio = (input.currentCount / expected).toFixed(1);
  return {
    id: 'noshow_surge',
    type: 'noshow_surge',
    severity: 'critical',
    message: `${input.currentCount} no-shows en este periodo (${ratio}× la media histórica)`,
    metric: 'noShow',
    weight: SEVERITY_WEIGHT.critical + input.currentCount,
  };
}

export function computeAlerts(input: {
  kpis: KpiSnapshot;
  stalls: StallInput[];
  awaitingReply?: WaitingResult;
  unattendedHandoffs?: WaitingResult;
  closeRateBaseline: number | null;
  noShowCurrentCount: number;
  noShowWindowDays: number;
  historicEvents: PipelineEvent[];
}): Alert[] {
  const out: Alert[] = [];

  // 1. WoW changes en 5 KPIs de volumen
  const volumeKpis: Array<keyof KpiSnapshot> = [
    'leads',
    'active',
    'qualified',
    'scheduled',
    'won',
  ];
  for (const k of volumeKpis) {
    const v = input.kpis[k] as { current: number; previous: number };
    const a = wowChangeAlert(k, v.current, v.previous);
    if (a) out.push(a);
  }

  // 2. Sin respuesta de la persona, por (canal × fase)
  for (const s of input.stalls) {
    const a = stallAlert(s);
    if (a) out.push(a);
  }

  // 3. Esperando respuesta
  if (input.awaitingReply) {
    const a = awaitingReplyAlert(input.awaitingReply);
    if (a) out.push(a);
  }

  // 4. Handoffs sin atender
  if (input.unattendedHandoffs) {
    const a = handoffUnattendedAlert(input.unattendedHandoffs);
    if (a) out.push(a);
  }

  // 5. Tasa cierre baja
  const closeAlert = lowCloseRateAlert({
    currentRate: input.kpis.closeRate.current,
    currentDenom: input.kpis.closeRate.denominator,
    baselineRate: input.closeRateBaseline,
  });
  if (closeAlert) out.push(closeAlert);

  // 6. Surge no-shows
  const noShowAlert = noShowSurgeAlert({
    currentCount: input.noShowCurrentCount,
    windowDays: input.noShowWindowDays,
    historicEvents: input.historicEvents,
  });
  if (noShowAlert) out.push(noShowAlert);

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}
