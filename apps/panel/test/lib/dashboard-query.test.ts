import { describe, it, expect } from 'vitest';
import {
  classifyChannel,
  aggregateMatrix,
  detectBottlenecks,
  ALL_CHANNEL_KEYS,
  ALL_MATRIX_COLUMNS,
  type ChannelInfo,
} from '../../lib/dashboard-query';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';

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

describe('classifyChannel', () => {
  it('whatsapp → wa', () => {
    expect(classifyChannel({ kind: 'whatsapp' }, 'inbound')).toBe('wa');
    expect(classifyChannel({ kind: 'whatsapp' }, 'outbound')).toBe('wa');
  });
  it('facebook_messenger → fb', () => {
    expect(classifyChannel({ kind: 'facebook_messenger' }, 'inbound')).toBe('fb');
  });
  it('instagram_dm + inbound → ig-in', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'inbound')).toBe('ig-in');
  });
  it('instagram_dm + outbound → ig-out', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'outbound')).toBe('ig-out');
  });
  it('instagram_dm + untagged → null', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'untagged')).toBeNull();
  });
  it('undefined channel → null', () => {
    expect(classifyChannel(undefined, 'inbound')).toBeNull();
  });
});

describe('aggregateMatrix — estructura', () => {
  it('5 rows en orden Leads/Activas/Cualificados/Agendados/Ganados', () => {
    const m = aggregateMatrix({
      events: [],
      convs: [],
      prevEvents: [],
      prevConvs: [],
      channelMap: new Map(),
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows.map((r) => r.key)).toEqual([
      'leads',
      'active',
      'qualified',
      'scheduled',
      'won',
    ]);
  });

  it('cada row tiene las 5 columnas (4 canales + total)', () => {
    const m = aggregateMatrix({
      events: [],
      convs: [],
      prevEvents: [],
      prevConvs: [],
      channelMap: new Map(),
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    for (const row of m.rows) {
      for (const col of ALL_MATRIX_COLUMNS) {
        expect(row.cells[col]).toBeDefined();
        expect(row.cells[col].count).toBe(0);
      }
    }
  });
});

describe('aggregateMatrix — leads', () => {
  it('reparte leads por canal y suma total', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
      [3, { kind: 'instagram_dm' }],
    ]);
    const convs = [
      conv({ id: 1, channel_id: 1, direction: 'inbound' }),
      conv({ id: 2, channel_id: 1, direction: 'outbound' }),
      conv({ id: 3, channel_id: 2, direction: 'inbound' }),
      conv({ id: 4, channel_id: 3, direction: 'inbound' }),
      conv({ id: 5, channel_id: 3, direction: 'outbound' }),
    ];
    const m = aggregateMatrix({
      events: [],
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const leads = m.rows[0]!;
    expect(leads.cells.wa.count).toBe(2);
    expect(leads.cells.fb.count).toBe(1);
    expect(leads.cells['ig-in'].count).toBe(1);
    expect(leads.cells['ig-out'].count).toBe(1);
    expect(leads.cells.total.count).toBe(5);
  });
});

describe('aggregateMatrix — heatmap intensity', () => {
  it('intensidad max=1 para canal con max count', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
    ]);
    // 4 leads WA, 1 lead FB
    const convs = [
      conv({ id: 1, channel_id: 1 }),
      conv({ id: 2, channel_id: 1 }),
      conv({ id: 3, channel_id: 1 }),
      conv({ id: 4, channel_id: 1 }),
      conv({ id: 5, channel_id: 2 }),
    ];
    const m = aggregateMatrix({
      events: [],
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const leads = m.rows[0]!;
    expect(leads.cells.wa.intensity).toBe(1);
    expect(leads.cells.fb.intensity).toBe(0.25);
    // total nunca tiene intensity (muted)
    expect(leads.cells.total.intensity).toBe(0);
  });
});

describe('aggregateMatrix — deltaPct', () => {
  it('null si prev=0', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const m = aggregateMatrix({
      events: [],
      convs: [conv({ id: 1, channel_id: 1 })],
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows[0]!.cells.wa.deltaPct).toBeNull();
  });

  it('calcula correctamente', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const cur = [conv({ id: 1, channel_id: 1 }), conv({ id: 2, channel_id: 1 })];
    const prev = [conv({ id: 100, channel_id: 1 })];
    const m = aggregateMatrix({
      events: [],
      convs: cur,
      prevEvents: [],
      prevConvs: prev,
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows[0]!.cells.wa.deltaPct).toBeCloseTo(1); // +100%
  });
});

describe('aggregateMatrix — qualified row', () => {
  it('cuenta phase_change to=5 por canal correcto', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const convs = [conv({ id: 10, channel_id: 1 }), conv({ id: 11, channel_id: 1 })];
    const events: PipelineEvent[] = [
      ev({ to_value: '5', conversation_id: 10 }),
      ev({ to_value: '5', conversation_id: 11 }),
    ];
    const m = aggregateMatrix({
      events,
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const qualified = m.rows.find((r) => r.key === 'qualified')!;
    expect(qualified.cells.wa.count).toBe(2);
  });
});

describe('detectBottlenecks', () => {
  it('detecta convs activas estancadas >5d', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const now = new Date('2026-05-10T12:00:00Z');
    const oldDate = new Date('2026-05-01T12:00:00Z'); // 9 días atrás
    const convs = Array.from({ length: 5 }, (_, i) =>
      conv({ id: i + 1, channel_id: 1, state: 'active' }),
    );
    const events: PipelineEvent[] = convs.map((c) =>
      ev({
        event_type: 'phase_change',
        to_value: '3',
        conversation_id: c.id,
        occurred_at: oldDate.toISOString(),
      }),
    );
    const result = detectBottlenecks({
      allRecentEvents: events,
      convs,
      channelMap,
      daysThreshold: 5,
      countThreshold: 5,
      now,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.channel).toBe('wa');
    expect(result[0]!.phase).toBe(3);
    expect(result[0]!.count).toBe(5);
    expect(result[0]!.daysStuckMax).toBeGreaterThanOrEqual(8);
  });

  it('excluye convs con outcome aplicado', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const now = new Date('2026-05-10T12:00:00Z');
    const old = new Date('2026-05-01T12:00:00Z');
    const convs = Array.from({ length: 6 }, (_, i) =>
      conv({ id: i + 1, channel_id: 1, state: 'active' }),
    );
    const events: PipelineEvent[] = [
      ...convs.map((c) =>
        ev({
          event_type: 'phase_change',
          to_value: '3',
          conversation_id: c.id,
          occurred_at: old.toISOString(),
        }),
      ),
      // 2 outcomes aplicados → 4 convs estancadas reales
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
      ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 2 }),
    ];
    const result = detectBottlenecks({
      allRecentEvents: events,
      convs,
      channelMap,
      daysThreshold: 5,
      countThreshold: 4,
      now,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(4);
  });

  it('no devuelve si count < threshold', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const now = new Date('2026-05-10T12:00:00Z');
    const old = new Date('2026-05-01T12:00:00Z');
    const convs = [
      conv({ id: 1, channel_id: 1 }),
      conv({ id: 2, channel_id: 1 }),
    ];
    const events: PipelineEvent[] = convs.map((c) =>
      ev({
        event_type: 'phase_change',
        to_value: '3',
        conversation_id: c.id,
        occurred_at: old.toISOString(),
      }),
    );
    const result = detectBottlenecks({
      allRecentEvents: events,
      convs,
      channelMap,
      daysThreshold: 5,
      countThreshold: 5,
      now,
    });
    expect(result).toEqual([]);
  });
});

describe('ALL_CHANNEL_KEYS / ALL_MATRIX_COLUMNS exports', () => {
  it('canales son 4', () => {
    expect(ALL_CHANNEL_KEYS).toEqual(['wa', 'fb', 'ig-in', 'ig-out']);
  });
  it('matrix columns incluye total', () => {
    expect(ALL_MATRIX_COLUMNS.length).toBe(5);
    expect(ALL_MATRIX_COLUMNS).toContain('total');
  });
});
