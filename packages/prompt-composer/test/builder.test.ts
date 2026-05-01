import { describe, it, expect } from 'vitest';
import { buildComposedPrompt } from '../src/builder.js';
import type { PromptBlockRow } from '../src/types.js';

const TENANT_ID = 2;

function makeRow(
  block_key: string,
  sort_order: number,
  tenant_id: number | null,
  content = `[${block_key} content]`,
): PromptBlockRow {
  return { block_key, sort_order, tenant_id, content };
}

const sharedRows: PromptBlockRow[] = [
  makeRow('core_v3_base', 0, null),
  makeRow('fase_1_v3', 10, null),
  makeRow('fase_2_v3', 20, null),
  makeRow('fase_3_v3', 30, null),
  makeRow('fase_4_v3', 40, null),
  makeRow('fase_5_v3', 50, null),
  makeRow('fase_6_v3', 60, null),
  makeRow('cualificacion_v3', 70, null),
  makeRow('handoff_v3', 80, null),
  makeRow('pipeline_v3', 90, null),
  makeRow('objeciones_v3', 100, null),
];

const coachRow: PromptBlockRow = makeRow('coach_v3', 5, TENANT_ID);

describe('buildComposedPrompt', () => {
  it('composes default prompt (phase 1) with core + coach + fase_1 + objeciones', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v3_base',
      'coach_v3',
      'fase_1_v3',
      'objeciones_v3',
    ]);
    expect(out.blocks).toHaveLength(4);
    expect(out.blocks[1]!.scope).toBe('tenant'); // coach
    expect(out.blocks[0]!.scope).toBe('shared'); // core
  });

  it('includes qualification + handoff + pipeline when flags are set', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isQualification: true,
      isHandoff: true,
      includePipeline: true,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v3_base',
      'coach_v3',
      'fase_4_v3',
      'cualificacion_v3',
      'handoff_v3',
      'pipeline_v3',
      'objeciones_v3',
    ]);
  });

  it('excludes objeciones when includeObjections is false', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      includeObjections: false,
    });

    expect(out.metadata.blocksLoaded).not.toContain('objeciones_v3');
  });

  it('applies two-point cache strategy by default', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v3_base', 'objeciones_v3']);
    expect(out.metadata.cacheBreakpoints).toBe(2);

    // systemContent debe reflejar el cache_control
    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
    });
    expect(out.systemContent[1]!.cache_control).toBeUndefined(); // coach_v3 no cacheado en two-point
  });

  it('single-point strategy caches only the last block', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'single-point',
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached).toHaveLength(1);
    expect(cached[0]!.key).toBe('objeciones_v3');
  });

  it('none strategy emits zero cache_control markers', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'none',
    });

    expect(out.metadata.cacheBreakpoints).toBe(0);
    for (const b of out.systemContent) {
      expect(b.cache_control).toBeUndefined();
    }
  });

  it('throws when coach_v3 is missing', () => {
    expect(() =>
      buildComposedPrompt(sharedRows, {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: coach_v3/);
  });

  it('throws when core_v3_base is missing', () => {
    const rowsNoCore = sharedRows.filter((r) => r.block_key !== 'core_v3_base');
    expect(() =>
      buildComposedPrompt([...rowsNoCore, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: core_v3_base/);
  });

  it('throws when the requested phase block is missing', () => {
    const rowsNoFase3 = sharedRows.filter((r) => r.block_key !== 'fase_3_v3');
    expect(() =>
      buildComposedPrompt([...rowsNoFase3, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 3,
      }),
    ).toThrow(/missing blocks for current options: fase_3_v3/);
  });

  it('rejects out-of-range currentPhase', () => {
    expect(() =>
      buildComposedPrompt([...sharedRows, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 7,
      }),
    ).toThrow(/currentPhase must be 1..6/);
    expect(() =>
      buildComposedPrompt([...sharedRows, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 0,
      }),
    ).toThrow(/currentPhase must be 1..6/);
  });

  it('picks tenant coach over a hypothetical shared coach with same key', () => {
    const sharedCoach = makeRow('coach_v3', 5, null, '[shared fallback coach]');
    const tenantCoach = makeRow('coach_v3', 5, TENANT_ID, '[tenant coach]');
    // Orden adverso a proposito: shared primero
    const out = buildComposedPrompt([...sharedRows, sharedCoach, tenantCoach], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const coachBlock = out.blocks.find((b) => b.key === 'coach_v3')!;
    expect(coachBlock.text).toBe('[tenant coach]');
    expect(coachBlock.scope).toBe('tenant');
  });

  it('metadata.totalChars matches concatenated content length', () => {
    const out = buildComposedPrompt([...sharedRows, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const expected = out.blocks.reduce((s, b) => s + b.text.length, 0);
    expect(out.metadata.totalChars).toBe(expected);
  });
});
