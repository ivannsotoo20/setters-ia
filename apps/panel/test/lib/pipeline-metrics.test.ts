import { describe, it, expect } from 'vitest';
import {
  computeShowRate,
  computeCloseRate,
  computeFunnelRates,
  computeOutcomeCounts,
  formatPercent,
  type PipelineEvent,
} from '../../lib/pipeline-metrics';

function ev(overrides: Partial<PipelineEvent>): PipelineEvent {
  return {
    event_type: 'outcome_applied',
    from_value: null,
    to_value: 'bought',
    source: 'manual',
    occurred_at: new Date().toISOString(),
    conversation_id: 1,
    ...overrides,
  };
}

describe('computeShowRate', () => {
  it('empty → 0/0', () => {
    const r = computeShowRate([]);
    expect(r).toEqual({ numerator: 0, denominator: 0, rate: 0 });
  });
  it('solo wins (won=2) → 2/2 = 1.0', () => {
    const r = computeShowRate([
      ev({ to_value: 'bought', conversation_id: 1 }),
      ev({ to_value: 'bought', conversation_id: 2 }),
    ]);
    expect(r.rate).toBe(1);
    expect(r.numerator).toBe(2);
    expect(r.denominator).toBe(2);
  });
  it('mix won+lost+cancelled+no_show', () => {
    const r = computeShowRate([
      ev({ to_value: 'bought', conversation_id: 1 }),
      ev({ to_value: 'bought', conversation_id: 2 }),
      ev({ to_value: 'lost', conversation_id: 3 }),
      ev({ to_value: 'cancelled', conversation_id: 4 }),
      ev({ to_value: 'no_show', conversation_id: 5 }),
    ]);
    expect(r.numerator).toBe(3); // 2 won + 1 lost
    expect(r.denominator).toBe(5);
    expect(r.rate).toBeCloseTo(0.6);
  });
  it('ignora outcome_removed events', () => {
    const r = computeShowRate([
      ev({ event_type: 'outcome_removed', to_value: 'bought' }),
      ev({ event_type: 'outcome_applied', to_value: 'lost' }),
    ]);
    expect(r.denominator).toBe(1);
    expect(r.numerator).toBe(1);
  });
});

describe('computeCloseRate', () => {
  it('empty → 0/0', () => {
    expect(computeCloseRate([])).toEqual({ numerator: 0, denominator: 0, rate: 0 });
  });
  it('won=3 lost=1 → 3/4 = 0.75', () => {
    const r = computeCloseRate([
      ev({ to_value: 'bought' }),
      ev({ to_value: 'bought' }),
      ev({ to_value: 'bought' }),
      ev({ to_value: 'lost' }),
    ]);
    expect(r.rate).toBeCloseTo(0.75);
  });
  it('solo cancelled+no_show no afecta close (denominator=0)', () => {
    const r = computeCloseRate([
      ev({ to_value: 'cancelled' }),
      ev({ to_value: 'no_show' }),
    ]);
    expect(r.denominator).toBe(0);
    expect(r.rate).toBe(0);
  });
});

describe('computeFunnelRates', () => {
  it('empty → 6 entries con 0', () => {
    const r = computeFunnelRates([]);
    expect(r).toHaveLength(6);
    for (const fr of r) {
      expect(fr.fromCount).toBe(0);
      expect(fr.toCount).toBe(0);
      expect(fr.rate).toBe(0);
    }
  });
  it('5 leads alcanzaron F1, 4 F2, 3 F3', () => {
    const events: PipelineEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      events.push(ev({ event_type: 'phase_change', to_value: '1', conversation_id: i }));
    }
    for (let i = 1; i <= 4; i++) {
      events.push(ev({ event_type: 'phase_change', to_value: '2', conversation_id: i }));
    }
    for (let i = 1; i <= 3; i++) {
      events.push(ev({ event_type: 'phase_change', to_value: '3', conversation_id: i }));
    }
    const r = computeFunnelRates(events);
    expect(r[0]).toMatchObject({ from: 1, to: 2, fromCount: 5, toCount: 4 });
    expect(r[0]!.rate).toBeCloseTo(4 / 5);
    expect(r[1]).toMatchObject({ from: 2, to: 3, fromCount: 4, toCount: 3 });
  });
  it('mismo conv en F2 múltiples veces → cuenta 1 en distinct', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'phase_change', to_value: '1', conversation_id: 1 }),
      ev({ event_type: 'phase_change', to_value: '2', conversation_id: 1 }),
      ev({ event_type: 'phase_change', to_value: '2', conversation_id: 1 }),
    ];
    const r = computeFunnelRates(events);
    expect(r[0]!.fromCount).toBe(1);
    expect(r[0]!.toCount).toBe(1);
    expect(r[0]!.rate).toBe(1);
  });
  it('ignora outcome_applied events', () => {
    const events: PipelineEvent[] = [
      ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 1 }),
    ];
    const r = computeFunnelRates(events);
    expect(r.every((x) => x.fromCount === 0 && x.toCount === 0)).toBe(true);
  });
});

describe('computeOutcomeCounts', () => {
  it('cuenta correctamente cada bucket', () => {
    const events = [
      ev({ to_value: 'bought' }),
      ev({ to_value: 'bought' }),
      ev({ to_value: 'lost' }),
      ev({ to_value: 'cancelled' }),
      ev({ to_value: 'no_show' }),
      ev({ to_value: 'recontact' }),
      ev({ to_value: 'recontact' }),
    ];
    expect(computeOutcomeCounts(events)).toEqual({
      bought: 2,
      lost: 1,
      cancelled: 1,
      no_show: 1,
      recontact: 2,
    });
  });
  it('empty → todos 0', () => {
    expect(computeOutcomeCounts([])).toEqual({
      bought: 0,
      lost: 0,
      cancelled: 0,
      no_show: 0,
      recontact: 0,
    });
  });
});

describe('formatPercent', () => {
  it('formatea con redondeo', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.756)).toBe('76%');
    expect(formatPercent(1)).toBe('100%');
  });
  it('rate negativo o NaN → em-dash', () => {
    expect(formatPercent(NaN)).toBe('—');
    expect(formatPercent(-0.1)).toBe('—');
  });
});
