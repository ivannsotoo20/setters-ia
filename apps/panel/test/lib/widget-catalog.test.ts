import { describe, it, expect } from 'vitest';
import {
  WIDGET_CATALOG,
  getWidgetDef,
  computeWidget,
} from '../../lib/widget-catalog';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

function conv(overrides: Partial<ConvSnapshot> = {}): ConvSnapshot {
  return {
    id: 1,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction: 'inbound',
    last_message_at: '2026-05-10T12:00:00Z',
    created_at: '2026-05-10T12:00:00Z',
    ...overrides,
  };
}

function ev(overrides: Partial<PipelineEvent>): PipelineEvent {
  return {
    event_type: 'phase_change',
    from_value: null,
    to_value: '5',
    source: 'motor',
    occurred_at: '2026-05-10T11:00:00Z',
    conversation_id: 1,
    ...overrides,
  };
}

const WINDOW_FROM = '2026-05-08T00:00:00Z';
const PREV_WINDOW_FROM = '2026-05-01T00:00:00Z';

describe('WIDGET_CATALOG', () => {
  it('contiene 18 métricas con keys únicas (12 de Lambda.2 + 6 de outbound)', () => {
    expect(WIDGET_CATALOG).toHaveLength(18);
    const keys = WIDGET_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(18);
  });

  it('todas categorizadas como volume o rate', () => {
    for (const m of WIDGET_CATALOG) {
      expect(['volume', 'rate']).toContain(m.category);
    }
  });

  it('todas tienen label + description no vacíos', () => {
    for (const m of WIDGET_CATALOG) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });
});

describe('getWidgetDef', () => {
  it('devuelve def por key conocida', () => {
    expect(getWidgetDef('leads_total')?.label).toBe('Leads totales');
  });
  it('undefined para key desconocida', () => {
    expect(getWidgetDef('xyz')).toBeUndefined();
  });
});

describe('computeWidget — leads_total', () => {
  it('cuenta convs sin filtro', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const cur = [conv({ id: 1 }), conv({ id: 2 })];
    const prev = [conv({ id: 100 })];
    const r = computeWidget(
      'leads_total',
      null,
      {
        currentEvents: [],
        prevEvents: [],
        currentConvs: cur,
        prevConvs: prev,
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    expect(r.category).toBe('volume');
    if (r.category === 'volume') {
      expect(r.value.current).toBe(2);
      expect(r.value.previous).toBe(1);
    }
  });

  it('aplica filtro canal=wa', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
    ]);
    const cur = [
      conv({ id: 1, channel_id: 1 }),
      conv({ id: 2, channel_id: 2 }),
      conv({ id: 3, channel_id: 1 }),
    ];
    const r = computeWidget(
      'leads_total',
      { channel: 'wa' },
      {
        currentEvents: [],
        prevEvents: [],
        currentConvs: cur,
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'volume') {
      expect(r.value.current).toBe(2);
    }
  });
});

describe('computeWidget — outcomes', () => {
  const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);

  it('won cuenta outcome bought', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 2 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 3 }),
    ];
    const r = computeWidget(
      'won',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'volume') expect(r.value.current).toBe(2);
  });

  it('no_show cuenta correctamente', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'no_show', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'no_show', conversation_id: 2 }),
    ];
    const r = computeWidget(
      'no_show',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'volume') expect(r.value.current).toBe(2);
  });

  it('lost / cancelled / recontact independientes', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'cancelled', conversation_id: 2 }),
      ev({ event_type: 'outcome_applied', to_value: 'recontact', conversation_id: 3 }),
    ];
    for (const [key, expected] of [
      ['lost', 1],
      ['cancelled', 1],
      ['recontact', 1],
    ] as const) {
      const r = computeWidget(
        key,
        null,
        {
          currentEvents: events,
          prevEvents: [],
          currentConvs: [],
          prevConvs: [],
          currentWindowFromIso: WINDOW_FROM,
          prevWindowFromIso: PREV_WINDOW_FROM,
        },
        channelMap,
      );
      if (r.category === 'volume') expect(r.value.current).toBe(expected);
    }
  });
});

describe('computeWidget — rates', () => {
  const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);

  it('show_rate calcula correctamente', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 2 }),
      ev({ event_type: 'outcome_applied', to_value: 'no_show', conversation_id: 3 }),
    ];
    const r = computeWidget(
      'show_rate',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(2); // won + lost
      expect(r.value.denominator).toBe(3);
      expect(r.value.current).toBeCloseTo(2 / 3);
    }
  });

  it('close_rate = won / (won + lost)', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 2 }),
    ];
    const r = computeWidget(
      'close_rate',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'rate') expect(r.value.current).toBeCloseTo(0.5);
  });

  it('qualification_rate = qualified / leads', () => {
    const channelMap2 = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const cur = [conv({ id: 1 }), conv({ id: 2 }), conv({ id: 3 }), conv({ id: 4 })];
    const events: PipelineEvent[] = [
      ev({ to_value: '5', conversation_id: 1 }),
      ev({ to_value: '5', conversation_id: 2 }),
    ];
    const r = computeWidget(
      'qualification_rate',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: cur,
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap2,
    );
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(2);
      expect(r.value.denominator).toBe(4);
      expect(r.value.current).toBeCloseTo(0.5);
    }
  });
});

describe('computeWidget — qualified / scheduled distinct', () => {
  const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);

  it('qualified distinct convs to=5', () => {
    const events: PipelineEvent[] = [
      ev({ to_value: '5', conversation_id: 1 }),
      ev({ to_value: '5', conversation_id: 1 }),
      ev({ to_value: '5', conversation_id: 2 }),
    ];
    const r = computeWidget(
      'qualified',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'volume') expect(r.value.current).toBe(2);
  });

  it('scheduled distinct convs to=6 OR 7', () => {
    const events: PipelineEvent[] = [
      ev({ to_value: '6', conversation_id: 1 }),
      ev({ to_value: '7', conversation_id: 2 }),
      ev({ to_value: '5', conversation_id: 3 }),
    ];
    const r = computeWidget(
      'scheduled',
      null,
      {
        currentEvents: events,
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      channelMap,
    );
    if (r.category === 'volume') expect(r.value.current).toBe(2);
  });
});

describe('computeWidget — métrica desconocida', () => {
  it('devuelve volume zero placeholder', () => {
    const r = computeWidget(
      'unknown_metric_xyz',
      null,
      {
        currentEvents: [],
        prevEvents: [],
        currentConvs: [],
        prevConvs: [],
        currentWindowFromIso: WINDOW_FROM,
        prevWindowFromIso: PREV_WINDOW_FROM,
      },
      new Map(),
    );
    expect(r.category).toBe('volume');
    if (r.category === 'volume') expect(r.value.current).toBe(0);
  });
});
