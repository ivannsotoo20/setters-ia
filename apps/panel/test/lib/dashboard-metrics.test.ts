import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  computeHistoricCloseRate,
  formatDelta,
  KPI_MIN_EVENTS,
  type ConvSnapshot,
} from '../../lib/dashboard-metrics';
import type { PipelineEvent } from '../../lib/pipeline-metrics';

function ev(overrides: Partial<PipelineEvent>): PipelineEvent {
  return {
    event_type: 'phase_change',
    from_value: null,
    to_value: '5',
    source: 'motor',
    occurred_at: new Date().toISOString(),
    conversation_id: 1,
    ...overrides,
  };
}

function conv(overrides: Partial<ConvSnapshot> = {}): ConvSnapshot {
  return {
    id: 1,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction: 'inbound',
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeKpis — empty input', () => {
  it('todos KPIs = 0 y hasInsufficientData=true', () => {
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: [],
      prevConvs: [],
      currentWindowFromIso: new Date().toISOString(),
      prevWindowFromIso: new Date().toISOString(),
    });
    expect(k.leads.current).toBe(0);
    expect(k.leads.hasInsufficientData).toBe(true);
    expect(k.scheduled.current).toBe(0);
    expect(k.showRate.current).toBe(0);
  });
});

describe('computeKpis — leads', () => {
  it('cuenta convs en current vs prev', () => {
    const now = '2026-05-10T12:00:00Z';
    const cur = Array.from({ length: 12 }, (_, i) => conv({ id: i + 1 }));
    const prev = Array.from({ length: 10 }, (_, i) => conv({ id: 100 + i }));
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: prev,
      currentWindowFromIso: now,
      prevWindowFromIso: now,
    });
    expect(k.leads.current).toBe(12);
    expect(k.leads.previous).toBe(10);
    expect(k.leads.deltaPct).toBeCloseTo(0.2);
    expect(k.leads.deltaSign).toBe('up');
    expect(k.leads.hasInsufficientData).toBe(false);
  });

  it('previous=0 → deltaPct=null', () => {
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: [conv({ id: 1 }), conv({ id: 2 })],
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.leads.deltaPct).toBeNull();
    expect(k.leads.deltaSign).toBe('up');
  });
});

describe('computeKpis — active', () => {
  it('solo cuenta state=active con last_message_at en window', () => {
    const cur = [
      conv({ id: 1, state: 'active', last_message_at: '2026-05-10T12:00:00Z' }),
      conv({ id: 2, state: 'active', last_message_at: '2026-05-09T08:00:00Z' }),
      conv({ id: 3, state: 'closed', last_message_at: '2026-05-10T12:00:00Z' }),
      conv({ id: 4, state: 'active', last_message_at: null }),
    ];
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.active.current).toBe(1);
  });
});

describe('computeKpis — qualified (phase_change to_value=5)', () => {
  it('distinct convs con event to=5', () => {
    const events: PipelineEvent[] = [
      ev({ to_value: '5', conversation_id: 1 }),
      ev({ to_value: '5', conversation_id: 2 }),
      ev({ to_value: '5', conversation_id: 1 }), // duplicado
      ev({ to_value: '4', conversation_id: 3 }),
    ];
    const k = computeKpis({
      currentEvents: events,
      prevEvents: [],
      currentConvs: [],
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.qualified.current).toBe(2);
  });
});

describe('computeKpis — scheduled (phase_change to F6/F7)', () => {
  it('distinct convs con to=6 o to=7', () => {
    const events: PipelineEvent[] = [
      ev({ to_value: '6', conversation_id: 1 }),
      ev({ to_value: '7', conversation_id: 2 }),
      ev({ to_value: '6', conversation_id: 2 }), // misma conv
      ev({ to_value: '5', conversation_id: 3 }),
    ];
    const k = computeKpis({
      currentEvents: events,
      prevEvents: [],
      currentConvs: [],
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.scheduled.current).toBe(2);
  });
});

describe('computeKpis — won (outcome bought)', () => {
  it('cuenta outcome_applied bought', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 2 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 3 }),
      ev({ event_type: 'outcome_removed', to_value: 'bought', conversation_id: 1 }),
    ];
    const k = computeKpis({
      currentEvents: events,
      prevEvents: [],
      currentConvs: [],
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.won.current).toBe(2); // ignora removed
  });
});

describe('computeKpis — showRate / closeRate', () => {
  it('reusa pipeline-metrics y rellena RateKpiValue', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 2 }),
    ];
    const k = computeKpis({
      currentEvents: events,
      prevEvents: [],
      currentConvs: [],
      prevConvs: [],
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.closeRate.current).toBeCloseTo(0.5);
    expect(k.closeRate.numerator).toBe(1);
    expect(k.closeRate.denominator).toBe(2);
  });
});

describe('computeKpis — deltaSign', () => {
  it('current<previous → down', () => {
    const cur = Array.from({ length: 5 }, (_, i) => conv({ id: i }));
    const prev = Array.from({ length: 15 }, (_, i) => conv({ id: 100 + i }));
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: prev,
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.leads.deltaSign).toBe('down');
    expect(k.leads.deltaPct).toBeCloseTo((5 - 15) / 15);
  });

  it('current=previous → flat', () => {
    const cur = Array.from({ length: 5 }, (_, i) => conv({ id: i }));
    const prev = Array.from({ length: 5 }, (_, i) => conv({ id: 100 + i }));
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: prev,
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.leads.deltaSign).toBe('flat');
  });
});

describe('hasInsufficientData', () => {
  it('current<10 y previous<10 → true', () => {
    const cur = Array.from({ length: 3 }, (_, i) => conv({ id: i }));
    const prev = Array.from({ length: 3 }, (_, i) => conv({ id: 100 + i }));
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: prev,
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.leads.hasInsufficientData).toBe(true);
  });

  it('current>=10 → false aunque prev sea bajo', () => {
    const cur = Array.from({ length: 12 }, (_, i) => conv({ id: i }));
    const prev = Array.from({ length: 2 }, (_, i) => conv({ id: 100 + i }));
    const k = computeKpis({
      currentEvents: [],
      prevEvents: [],
      currentConvs: cur,
      prevConvs: prev,
      currentWindowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(k.leads.hasInsufficientData).toBe(false);
  });
});

describe('computeHistoricCloseRate', () => {
  it('null si <KPI_MIN_EVENTS', () => {
    expect(computeHistoricCloseRate([])).toBeNull();
  });

  it('devuelve rate si >=10 outcomes', () => {
    const events: PipelineEvent[] = [];
    for (let i = 0; i < 8; i++) {
      events.push(ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: i }));
    }
    for (let i = 8; i < 16; i++) {
      events.push(ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: i }));
    }
    const r = computeHistoricCloseRate(events);
    expect(r).toBeCloseTo(0.5);
  });
});

describe('formatDelta', () => {
  it('null → em-dash', () => {
    expect(
      formatDelta({
        current: 5,
        previous: 0,
        deltaPct: null,
        deltaSign: 'flat',
        hasInsufficientData: false,
      }),
    ).toBe('—');
  });

  it('positivo redondeado con flecha', () => {
    expect(
      formatDelta({
        current: 12,
        previous: 10,
        deltaPct: 0.2,
        deltaSign: 'up',
        hasInsufficientData: false,
      }),
    ).toBe('↑20%');
  });

  it('negativo con flecha down', () => {
    expect(
      formatDelta({
        current: 8,
        previous: 10,
        deltaPct: -0.2,
        deltaSign: 'down',
        hasInsufficientData: false,
      }),
    ).toBe('↓20%');
  });
});

describe('KPI_MIN_EVENTS exported = 10', () => {
  it('se exporta', () => {
    expect(KPI_MIN_EVENTS).toBe(10);
  });
});
