import { describe, it, expect } from 'vitest';
import {
  pickGranularity,
  aggregateTrend,
  _internal,
} from '../../lib/dashboard-trend';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

describe('pickGranularity', () => {
  it('< 60d → day', () => {
    expect(pickGranularity(7)).toBe('day');
    expect(pickGranularity(30)).toBe('day');
    expect(pickGranularity(60)).toBe('day');
  });
  it('60-180d → week', () => {
    expect(pickGranularity(61)).toBe('week');
    expect(pickGranularity(120)).toBe('week');
    expect(pickGranularity(180)).toBe('week');
  });
  it('> 180d → month', () => {
    expect(pickGranularity(181)).toBe('month');
    expect(pickGranularity(365)).toBe('month');
  });
});

describe('bucketKey internals', () => {
  it('day = YYYY-MM-DD', () => {
    expect(_internal.bucketKey('2026-05-10T15:23:00Z', 'day')).toBe('2026-05-10');
  });
  it('month = YYYY-MM', () => {
    expect(_internal.bucketKey('2026-05-10T15:23:00Z', 'month')).toBe('2026-05');
  });
  it('week = YYYY-Www', () => {
    const k = _internal.bucketKey('2026-05-10T15:23:00Z', 'week');
    expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('bucketIterator continuidad', () => {
  it('rellena días vacíos entre from/to', () => {
    const buckets = _internal.bucketIterator(
      '2026-05-08T00:00:00Z',
      '2026-05-10T00:00:00Z',
      'day',
    );
    expect(buckets).toEqual(['2026-05-08', '2026-05-09', '2026-05-10']);
  });
});

describe('aggregateTrend', () => {
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

  it('puntos vacíos rellenados con 0', () => {
    const t = aggregateTrend({
      events: [],
      convs: [],
      channelMap: new Map(),
      fromIso: '2026-05-08T00:00:00Z',
      toIso: '2026-05-10T00:00:00Z',
      granularity: 'day',
    });
    expect(t).toHaveLength(3);
    for (const p of t) {
      expect(p.total).toBe(0);
      expect(p.qualifiedRate).toBeNull();
    }
  });

  it('stack por canal suma total', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
    ]);
    const convs = [
      conv({ id: 1, channel_id: 1, created_at: '2026-05-10T08:00:00Z' }),
      conv({ id: 2, channel_id: 1, created_at: '2026-05-10T09:00:00Z' }),
      conv({ id: 3, channel_id: 2, created_at: '2026-05-10T10:00:00Z' }),
    ];
    const t = aggregateTrend({
      events: [],
      convs,
      channelMap,
      fromIso: '2026-05-10T00:00:00Z',
      toIso: '2026-05-10T23:59:00Z',
      granularity: 'day',
    });
    const point = t.find((p) => p.date === '2026-05-10')!;
    expect(point.byChannel.wa).toBe(2);
    expect(point.byChannel.fb).toBe(1);
    expect(point.total).toBe(3);
  });

  it('qualifiedRate = qualified events distinct / total', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const convs = [
      conv({ id: 1, channel_id: 1, created_at: '2026-05-10T08:00:00Z' }),
      conv({ id: 2, channel_id: 1, created_at: '2026-05-10T09:00:00Z' }),
    ];
    const events: PipelineEvent[] = [
      {
        event_type: 'phase_change',
        from_value: null,
        to_value: '5',
        source: 'motor',
        occurred_at: '2026-05-10T11:00:00Z',
        conversation_id: 1,
      },
    ];
    const t = aggregateTrend({
      events,
      convs,
      channelMap,
      fromIso: '2026-05-10T00:00:00Z',
      toIso: '2026-05-10T23:59:00Z',
      granularity: 'day',
    });
    const p = t.find((x) => x.date === '2026-05-10')!;
    expect(p.qualifiedRate).toBeCloseTo(0.5);
  });

  it('total=0 → qualifiedRate null', () => {
    const t = aggregateTrend({
      events: [],
      convs: [],
      channelMap: new Map(),
      fromIso: '2026-05-10T00:00:00Z',
      toIso: '2026-05-10T23:59:00Z',
      granularity: 'day',
    });
    expect(t[0]!.qualifiedRate).toBeNull();
  });
});
