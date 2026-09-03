import { describe, it, expect } from 'vitest';
import { computeAlerts, ALERT_THRESHOLDS } from '../../lib/dashboard-alerts';
import type { KpiSnapshot } from '../../lib/dashboard-metrics';
import type { StallInput, WaitingResult } from '../../lib/dashboard-query';
import type { PipelineEvent } from '../../lib/pipeline-metrics';

function emptyKpis(): KpiSnapshot {
  const v = { current: 0, previous: 0, deltaPct: null, deltaSign: 'flat' as const, hasInsufficientData: true };
  const r = { ...v, numerator: 0, denominator: 0 };
  return {
    leads: v,
    active: v,
    qualified: v,
    scheduled: v,
    won: v,
    showRate: r,
    closeRate: r,
  };
}

describe('computeAlerts — WoW change', () => {
  it('caída <15% → no alerta', () => {
    const k = emptyKpis();
    k.leads = { current: 11, previous: 12, deltaPct: -0.083, deltaSign: 'down', hasInsufficientData: false };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toEqual([]);
  });

  it('caída ≥15% pero <10 events → no alerta (ruido)', () => {
    const k = emptyKpis();
    k.scheduled = { current: 5, previous: 8, deltaPct: -0.375, deltaSign: 'down', hasInsufficientData: true };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toEqual([]);
  });

  it('caída ≥15% y ≥10 events → alerta warning', () => {
    const k = emptyKpis();
    k.scheduled = { current: 12, previous: 18, deltaPct: -0.333, deltaSign: 'down', hasInsufficientData: false };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.type).toBe('wow_change');
    expect(a[0]!.severity).toBe('warning');
    expect(a[0]!.message).toMatch(/cayeron 33%/);
  });

  it('subida ≥15% → alerta info (positiva)', () => {
    const k = emptyKpis();
    k.won = { current: 15, previous: 10, deltaPct: 0.5, deltaSign: 'up', hasInsufficientData: false };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.severity).toBe('info');
    expect(a[0]!.message).toMatch(/subieron 50%/);
  });

  it('previous=0 → no alerta (no hay base de comparación)', () => {
    const k = emptyKpis();
    k.leads = { current: 20, previous: 0, deltaPct: null, deltaSign: 'up', hasInsufficientData: false };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toEqual([]);
  });
});

describe('computeAlerts — sin respuesta de la persona', () => {
  it('5 personas ≥3d sin contestar en F3 → alerta info', () => {
    const b: StallInput[] = [
      { channel: 'fb', phase: 3, count: 5, daysStuckMin: 7, daysStuckMax: 7 },
    ];
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: b,
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.type).toBe('bottleneck');
    expect(a[0]!.severity).toBe('info');
    expect(a[0]!.message).toBe(
      '5 personas de Facebook llevan más de 7 días sin contestar en F3 (cualificación)',
    );
  });

  it('10+ personas → severity warning', () => {
    const b: StallInput[] = [
      { channel: 'wa', phase: 4, count: 14, daysStuckMin: 8, daysStuckMax: 8 },
    ];
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: b,
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a[0]!.severity).toBe('warning');
  });

  it('< 5 personas → no alerta', () => {
    const b: StallInput[] = [
      { channel: 'wa', phase: 4, count: 3, daysStuckMin: 8, daysStuckMax: 8 },
    ];
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: b,
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a).toEqual([]);
  });
});

describe('computeAlerts — low close rate', () => {
  it('caída ≥50% vs histórico Y >=10 outcomes → alerta', () => {
    const k = emptyKpis();
    k.closeRate = {
      current: 0.12,
      previous: 0.2,
      deltaPct: -0.4,
      deltaSign: 'down',
      hasInsufficientData: false,
      numerator: 12,
      denominator: 100,
    };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: 0.28,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    const closeAlert = a.find((x) => x.type === 'low_close_rate');
    expect(closeAlert).toBeDefined();
    expect(closeAlert!.message).toMatch(/12%/);
    expect(closeAlert!.message).toMatch(/28%/);
  });

  it('caída <50% vs histórico → no alerta', () => {
    const k = emptyKpis();
    k.closeRate = {
      current: 0.22,
      previous: 0.25,
      deltaPct: -0.12,
      deltaSign: 'down',
      hasInsufficientData: false,
      numerator: 22,
      denominator: 100,
    };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: 0.28,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a.find((x) => x.type === 'low_close_rate')).toBeUndefined();
  });

  it('< 10 outcomes → no alerta aunque caída sea grande', () => {
    const k = emptyKpis();
    k.closeRate = {
      current: 0.1,
      previous: 0.5,
      deltaPct: -0.8,
      deltaSign: 'down',
      hasInsufficientData: true,
      numerator: 1,
      denominator: 9,
    };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: 0.5,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a.find((x) => x.type === 'low_close_rate')).toBeUndefined();
  });

  it('baseline null → no alerta', () => {
    const k = emptyKpis();
    k.closeRate = {
      current: 0.05,
      previous: 0.3,
      deltaPct: -0.83,
      deltaSign: 'down',
      hasInsufficientData: false,
      numerator: 5,
      denominator: 100,
    };
    const a = computeAlerts({
      kpis: k,
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 0,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a.find((x) => x.type === 'low_close_rate')).toBeUndefined();
  });
});

describe('computeAlerts — no-show surge', () => {
  function noShowEv(occurredAt: string): PipelineEvent {
    return {
      event_type: 'outcome_applied',
      from_value: null,
      to_value: 'no_show',
      source: 'manual',
      occurred_at: occurredAt,
      conversation_id: Math.random(),
    };
  }

  it('count <3 → no alerta', () => {
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 2,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a.find((x) => x.type === 'noshow_surge')).toBeUndefined();
  });

  it('count >=3 sin baseline (0 historic) Y >=5 abs → alerta warning', () => {
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 6,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    const ns = a.find((x) => x.type === 'noshow_surge');
    expect(ns).toBeDefined();
    expect(ns!.severity).toBe('warning');
  });

  it('count >=3× baseline → alerta critical', () => {
    // baseline 60d con 12 no-shows = 0.2/día → 1.4 esperados en 7d. 6 reales = 4.3× → critical
    const histEv = Array.from({ length: 12 }, () => noShowEv('2026-04-15T10:00:00Z'));
    const a = computeAlerts({
      kpis: emptyKpis(),
      stalls: [],
      closeRateBaseline: null,
      noShowCurrentCount: 6,
      noShowWindowDays: 7,
      historicEvents: histEv,
    });
    const ns = a.find((x) => x.type === 'noshow_surge');
    expect(ns).toBeDefined();
    expect(ns!.severity).toBe('critical');
    expect(ns!.message).toMatch(/4\.3×/);
  });
});

describe('computeAlerts — sort + max 5', () => {
  it('devuelve max 5 ordenadas por weight desc', () => {
    const k = emptyKpis();
    k.leads = { current: 20, previous: 10, deltaPct: 1, deltaSign: 'up', hasInsufficientData: false };
    k.active = { current: 22, previous: 11, deltaPct: 1, deltaSign: 'up', hasInsufficientData: false };
    k.qualified = { current: 25, previous: 12, deltaPct: 1.08, deltaSign: 'up', hasInsufficientData: false };
    k.scheduled = { current: 30, previous: 15, deltaPct: 1, deltaSign: 'up', hasInsufficientData: false };
    k.won = { current: 50, previous: 25, deltaPct: 1, deltaSign: 'up', hasInsufficientData: false };
    const b: StallInput[] = [
      { channel: 'wa', phase: 3, count: 14, daysStuckMin: 8, daysStuckMax: 8 },
      { channel: 'fb', phase: 4, count: 7, daysStuckMin: 6, daysStuckMax: 6 },
    ];
    const a = computeAlerts({
      kpis: k,
      stalls: b,
      closeRateBaseline: null,
      noShowCurrentCount: 5,
      noShowWindowDays: 7,
      historicEvents: [],
    });
    expect(a.length).toBeLessThanOrEqual(5);
    // weight desc
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1]!.weight).toBeGreaterThanOrEqual(a[i]!.weight);
    }
  });
});

describe('ALERT_THRESHOLDS exported', () => {
  it('thresholds documentados', () => {
    expect(ALERT_THRESHOLDS.wowMinEvents).toBe(10);
    expect(ALERT_THRESHOLDS.wowMinChangePct).toBe(0.15);
    expect(ALERT_THRESHOLDS.bottleneckMinCount).toBe(5);
    expect(ALERT_THRESHOLDS.bottleneckMinDays).toBe(3);
    expect(ALERT_THRESHOLDS.awaitingReplyMinHours).toBe(2);
    expect(ALERT_THRESHOLDS.handoffUnattendedMinHours).toBe(24);
  });
});

function none(): WaitingResult {
  return { count: 0, hoursWaitingMax: 0, convIds: [] };
}

function baseInput() {
  return {
    kpis: emptyKpis(),
    stalls: [] as StallInput[],
    awaitingReply: none(),
    unattendedHandoffs: none(),
    closeRateBaseline: null,
    noShowCurrentCount: 0,
    noShowWindowDays: 7,
    historicEvents: [] as PipelineEvent[],
  };
}

describe('computeAlerts — esperando respuesta', () => {
  it('1 persona esperando → alerta critical, en singular', () => {
    const a = computeAlerts({
      ...baseInput(),
      awaitingReply: { count: 1, hoursWaitingMax: 3, convIds: [7] },
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.type).toBe('awaiting_reply');
    expect(a[0]!.severity).toBe('critical');
    expect(a[0]!.message).toBe('1 persona está esperando respuesta y nadie le ha contestado');
  });

  it('varias → plural', () => {
    const a = computeAlerts({
      ...baseInput(),
      awaitingReply: { count: 4, hoursWaitingMax: 30, convIds: [1, 2, 3, 4] },
    });
    expect(a[0]!.message).toBe('4 personas están esperando respuesta y nadie les ha contestado');
  });

  it('0 → sin alerta', () => {
    expect(computeAlerts(baseInput())).toEqual([]);
  });

  it('va por delante de un warning de sin-respuesta: critical pesa más', () => {
    const a = computeAlerts({
      ...baseInput(),
      stalls: [{ channel: 'wa', phase: 2, count: 14, daysStuckMin: 3, daysStuckMax: 9 }],
      awaitingReply: { count: 1, hoursWaitingMax: 3, convIds: [7] },
    });
    expect(a.map((x) => x.type)).toEqual(['awaiting_reply', 'bottleneck']);
  });
});

describe('computeAlerts — handoffs sin atender', () => {
  it('1 conversación → warning, en singular', () => {
    const a = computeAlerts({
      ...baseInput(),
      unattendedHandoffs: { count: 1, hoursWaitingMax: 30, convIds: [9] },
    });
    expect(a).toHaveLength(1);
    expect(a[0]!.type).toBe('handoff_unattended');
    expect(a[0]!.severity).toBe('warning');
    expect(a[0]!.message).toBe(
      '1 conversación lleva más de 24 h en manos de la entrenadora sin respuesta',
    );
  });

  it('varias → plural', () => {
    const a = computeAlerts({
      ...baseInput(),
      unattendedHandoffs: { count: 3, hoursWaitingMax: 50, convIds: [1, 2, 3] },
    });
    expect(a[0]!.message).toBe(
      '3 conversaciones llevan más de 24 h en manos de la entrenadora sin respuesta',
    );
  });

  it('0 → sin alerta', () => {
    expect(computeAlerts({ ...baseInput(), unattendedHandoffs: none() })).toEqual([]);
  });
});
