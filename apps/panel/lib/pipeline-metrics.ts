/**
 * Sprint Kappa — Métricas puras del pipeline visual.
 *
 * Recibe `PipelineEvent[]` (snapshot del time window seleccionado) y devuelve
 * Show%, Close% y Funnel rates F1→F2 ... F6→F7.
 *
 * Definiciones:
 *   Show%  = (won + lost) / (won + lost + cancelled + no_show)
 *           "De las citas agendadas, qué % se presentó."
 *   Close% = won / (won + lost)
 *           "De los que se presentaron, qué % cerró."
 *   Funnel(Fn → Fn+1) = |distinct conv_id que alcanzaron Fn+1| /
 *                       |distinct conv_id que alcanzaron Fn|
 *
 * Sin deps de DB; el caller pasa el array ya filtrado por time window.
 */

export interface PipelineEvent {
  event_type: 'phase_change' | 'outcome_applied' | 'outcome_removed';
  from_value: string | null;
  to_value: string;
  source: string;
  occurred_at: string;
  conversation_id: number;
}

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number; // 0..1; 0 si denominator=0
}

export interface FunnelRate {
  from: number; // 1..6
  to: number; // 2..7
  fromCount: number;
  toCount: number;
  rate: number; // 0..1
}

export function computeShowRate(events: PipelineEvent[]): RateMetric {
  const outcomes = events.filter((e) => e.event_type === 'outcome_applied');
  const won = outcomes.filter((e) => e.to_value === 'bought').length;
  const lost = outcomes.filter((e) => e.to_value === 'lost').length;
  const cancelled = outcomes.filter((e) => e.to_value === 'cancelled').length;
  const noShow = outcomes.filter((e) => e.to_value === 'no_show').length;
  const denom = won + lost + cancelled + noShow;
  return {
    numerator: won + lost,
    denominator: denom,
    rate: denom > 0 ? (won + lost) / denom : 0,
  };
}

export function computeCloseRate(events: PipelineEvent[]): RateMetric {
  const outcomes = events.filter((e) => e.event_type === 'outcome_applied');
  const won = outcomes.filter((e) => e.to_value === 'bought').length;
  const lost = outcomes.filter((e) => e.to_value === 'lost').length;
  const denom = won + lost;
  return {
    numerator: won,
    denominator: denom,
    rate: denom > 0 ? won / denom : 0,
  };
}

export function computeFunnelRates(events: PipelineEvent[]): FunnelRate[] {
  const phaseEvents = events.filter((e) => e.event_type === 'phase_change');
  const reachedByPhase = new Map<string, Set<number>>();
  for (const e of phaseEvents) {
    if (!reachedByPhase.has(e.to_value)) reachedByPhase.set(e.to_value, new Set());
    reachedByPhase.get(e.to_value)!.add(e.conversation_id);
  }
  const rates: FunnelRate[] = [];
  for (let n = 1; n <= 6; n++) {
    const fromSet = reachedByPhase.get(String(n));
    const toSet = reachedByPhase.get(String(n + 1));
    const fromCount = fromSet?.size ?? 0;
    const toCount = toSet?.size ?? 0;
    rates.push({
      from: n,
      to: n + 1,
      fromCount,
      toCount,
      rate: fromCount > 0 ? toCount / fromCount : 0,
    });
  }
  return rates;
}

export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return '—';
  return `${Math.round(rate * 100)}%`;
}

export interface OutcomeCounts {
  bought: number;
  lost: number;
  cancelled: number;
  no_show: number;
  recontact: number;
}

export function computeOutcomeCounts(events: PipelineEvent[]): OutcomeCounts {
  const outcomes = events.filter((e) => e.event_type === 'outcome_applied');
  return {
    bought: outcomes.filter((e) => e.to_value === 'bought').length,
    lost: outcomes.filter((e) => e.to_value === 'lost').length,
    cancelled: outcomes.filter((e) => e.to_value === 'cancelled').length,
    no_show: outcomes.filter((e) => e.to_value === 'no_show').length,
    recontact: outcomes.filter((e) => e.to_value === 'recontact').length,
  };
}
