import { describe, it, expect } from 'vitest';
import {
  aggregatePipelineRuns,
  type PipelineRunRow,
} from '../src/services/pipeline-stats.js';

function row(overrides: Partial<PipelineRunRow> = {}): PipelineRunRow {
  return {
    outcome: 'success',
    duration_ms: 1000,
    total_cost_usd: 0.01,
    generator_cost_usd: 0.008,
    judge_cost_usd: 0.001,
    splitter_cost_usd: 0.001,
    total_tokens_in: 1000,
    total_tokens_out: 100,
    splitter_parts: 2,
    judge_decision: 'pass',
    ...overrides,
  };
}

describe('aggregatePipelineRuns — empty input', () => {
  it('returns zeros and nulls for an empty array', () => {
    const agg = aggregatePipelineRuns([]);
    expect(agg.totalRuns).toBe(0);
    expect(agg.byOutcome).toEqual({});
    expect(agg.byJudgeDecision).toEqual({});
    expect(agg.cost.totalUsd).toBe(0);
    expect(agg.cost.avgUsdPerRun).toBe(0);
    expect(agg.latencyMs.p50).toBeNull();
    expect(agg.latencyMs.p95).toBeNull();
    expect(agg.latencyMs.avg).toBeNull();
    expect(agg.tokens.inTotal).toBe(0);
    expect(agg.tokens.outTotal).toBe(0);
    expect(agg.splitterParts.avg).toBeNull();
  });
});

describe('aggregatePipelineRuns — outcome counts', () => {
  it('counts outcomes correctly', () => {
    const agg = aggregatePipelineRuns([
      row({ outcome: 'success' }),
      row({ outcome: 'success' }),
      row({ outcome: 'judge_reject' }),
      row({ outcome: 'pipeline_error' }),
    ]);
    expect(agg.totalRuns).toBe(4);
    expect(agg.byOutcome).toEqual({
      success: 2,
      judge_reject: 1,
      pipeline_error: 1,
    });
  });

  it('counts judge decisions ignoring nulls', () => {
    const agg = aggregatePipelineRuns([
      row({ judge_decision: 'pass' }),
      row({ judge_decision: 'fix' }),
      row({ judge_decision: null }),
      row({ judge_decision: 'pass' }),
    ]);
    expect(agg.byJudgeDecision).toEqual({ pass: 2, fix: 1 });
  });
});

describe('aggregatePipelineRuns — cost', () => {
  it('sums total cost across rows', () => {
    const agg = aggregatePipelineRuns([
      row({ total_cost_usd: 0.01 }),
      row({ total_cost_usd: 0.02 }),
      row({ total_cost_usd: 0.005 }),
    ]);
    expect(agg.cost.totalUsd).toBe(0.035);
    expect(agg.cost.avgUsdPerRun).toBeCloseTo(0.011667, 5);
  });

  it('sums per-stage costs independently', () => {
    const agg = aggregatePipelineRuns([
      row({ generator_cost_usd: 0.005, judge_cost_usd: 0.001, splitter_cost_usd: 0.001 }),
      row({ generator_cost_usd: 0.008, judge_cost_usd: 0.002, splitter_cost_usd: 0.0015 }),
    ]);
    expect(agg.cost.generatorUsd).toBeCloseTo(0.013, 5);
    expect(agg.cost.judgeUsd).toBeCloseTo(0.003, 5);
    expect(agg.cost.splitterUsd).toBeCloseTo(0.0025, 5);
  });

  it('tolerates null cost columns (in_progress runs)', () => {
    const agg = aggregatePipelineRuns([
      row({ outcome: 'in_progress', total_cost_usd: null, generator_cost_usd: null }),
      row({ outcome: 'success', total_cost_usd: 0.01 }),
    ]);
    expect(agg.cost.totalUsd).toBeCloseTo(0.01, 5);
  });
});

describe('aggregatePipelineRuns — latency p50/p95/avg', () => {
  it('returns the only value for length=1', () => {
    const agg = aggregatePipelineRuns([row({ duration_ms: 500 })]);
    expect(agg.latencyMs.p50).toBe(500);
    expect(agg.latencyMs.p95).toBe(500);
    expect(agg.latencyMs.avg).toBe(500);
  });

  it('computes p50 and p95 across many values', () => {
    const durations = Array.from({ length: 100 }, (_, i) => (i + 1) * 10); // 10, 20, ..., 1000
    const rows = durations.map((d) => row({ duration_ms: d }));
    const agg = aggregatePipelineRuns(rows);
    // p50: idx=ceil(0.5*100)-1=49 → value 500
    expect(agg.latencyMs.p50).toBe(500);
    // p95: idx=ceil(0.95*100)-1=94 → value 950
    expect(agg.latencyMs.p95).toBe(950);
    expect(agg.latencyMs.avg).toBe(505);
  });

  it('ignores null durations', () => {
    const agg = aggregatePipelineRuns([
      row({ duration_ms: 100 }),
      row({ duration_ms: null }),
      row({ duration_ms: 300 }),
    ]);
    expect(agg.latencyMs.avg).toBe(200);
  });
});

describe('aggregatePipelineRuns — tokens and splitter parts', () => {
  it('sums tokens in/out', () => {
    const agg = aggregatePipelineRuns([
      row({ total_tokens_in: 1000, total_tokens_out: 100 }),
      row({ total_tokens_in: 2000, total_tokens_out: 200 }),
    ]);
    expect(agg.tokens.inTotal).toBe(3000);
    expect(agg.tokens.outTotal).toBe(300);
  });

  it('averages splitter parts', () => {
    const agg = aggregatePipelineRuns([
      row({ splitter_parts: 2 }),
      row({ splitter_parts: 3 }),
      row({ splitter_parts: 1 }),
    ]);
    expect(agg.splitterParts.avg).toBeCloseTo(2.0, 2);
  });

  it('returns null splitter avg when no rows', () => {
    const agg = aggregatePipelineRuns([row({ splitter_parts: null })]);
    expect(agg.splitterParts.avg).toBeNull();
  });
});

describe('aggregatePipelineRuns — realistic scenario', () => {
  it('matches a typical 14-turn conversation', () => {
    const turns: PipelineRunRow[] = [
      // 1 cold + 13 warm
      row({ duration_ms: 7500, total_cost_usd: 0.029, splitter_parts: 1, judge_decision: 'pass' }),
      ...Array.from({ length: 13 }, () =>
        row({ duration_ms: 4500, total_cost_usd: 0.005, splitter_parts: 2, judge_decision: 'pass' }),
      ),
    ];
    const agg = aggregatePipelineRuns(turns);
    expect(agg.totalRuns).toBe(14);
    expect(agg.byOutcome.success).toBe(14);
    expect(agg.byJudgeDecision.pass).toBe(14);
    expect(agg.cost.totalUsd).toBeCloseTo(0.094, 3);
    expect(agg.cost.avgUsdPerRun).toBeCloseTo(0.006714, 5);
    expect(agg.splitterParts.avg).toBeCloseTo(1.93, 2);
  });
});
