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

const sharedRowsV4: PromptBlockRow[] = [
  makeRow('core_v4_base', 0, null),
  makeRow('fase_1_v4', 10, null),
  makeRow('fase_2_v4', 20, null),
  makeRow('fase_3_v4', 30, null),
  makeRow('fase_4_v4', 40, null),
  makeRow('fase_5_v4', 50, null),
  makeRow('fase_6_v4', 60, null),
  makeRow('objeciones_v4', 70, null),
  makeRow('descualificacion_v4', 80, null),
  makeRow('handoff_v4', 90, null),
  makeRow('output_contract_v4', 100, null),
];

const coachRow: PromptBlockRow = makeRow('coach_v3', 5, TENANT_ID);

describe('buildComposedPrompt (v4)', () => {
  it('composes default prompt (phase 1) with core + coach + fase_1 + objeciones + descualificacion + output_contract', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v4_base',
      'coach_v3',
      'fase_1_v4',
      'objeciones_v4',
      'descualificacion_v4',
      'output_contract_v4',
    ]);
    expect(out.blocks).toHaveLength(6);
    expect(out.blocks[1]!.scope).toBe('tenant'); // coach
    expect(out.blocks[0]!.scope).toBe('shared'); // core
  });

  it('includes handoff when isHandoff=true', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isHandoff: true,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v4_base',
      'coach_v3',
      'fase_4_v4',
      'handoff_v4',
      'objeciones_v4',
      'descualificacion_v4',
      'output_contract_v4',
    ]);
  });

  it('excludes objeciones when includeObjections is false', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      includeObjections: false,
    });

    expect(out.metadata.blocksLoaded).not.toContain('objeciones_v4');
  });

  it('excludes descualificacion when includeDescualificacion is false', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      includeDescualificacion: false,
    });

    expect(out.metadata.blocksLoaded).not.toContain('descualificacion_v4');
  });

  it('excludes output_contract when includeOutputContract is false', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      includeOutputContract: false,
    });

    expect(out.metadata.blocksLoaded).not.toContain('output_contract_v4');
  });

  it('applies two-point cache strategy by default (core_v4_base + last block cached)', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v4_base', 'output_contract_v4']);
    expect(out.metadata.cacheBreakpoints).toBe(2);

    // systemContent debe reflejar el cache_control
    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
    });
    expect(out.systemContent[1]!.cache_control).toBeUndefined(); // coach_v3 no cacheado en two-point
  });

  it('single-point strategy caches only the last block', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'single-point',
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached).toHaveLength(1);
    expect(cached[0]!.key).toBe('output_contract_v4');
  });

  it('none strategy emits zero cache_control markers', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
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
      buildComposedPrompt(sharedRowsV4, {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: coach_v3/);
  });

  it('throws when core_v4_base is missing', () => {
    const rowsNoCore = sharedRowsV4.filter((r) => r.block_key !== 'core_v4_base');
    expect(() =>
      buildComposedPrompt([...rowsNoCore, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: core_v4_base/);
  });

  it('throws when the requested phase block is missing', () => {
    const rowsNoFase3 = sharedRowsV4.filter((r) => r.block_key !== 'fase_3_v4');
    expect(() =>
      buildComposedPrompt([...rowsNoFase3, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 3,
      }),
    ).toThrow(/missing blocks for current options: fase_3_v4/);
  });

  it('rejects out-of-range currentPhase', () => {
    expect(() =>
      buildComposedPrompt([...sharedRowsV4, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 7,
      }),
    ).toThrow(/currentPhase must be 1..6/);
    expect(() =>
      buildComposedPrompt([...sharedRowsV4, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 0,
      }),
    ).toThrow(/currentPhase must be 1..6/);
  });

  it('picks tenant coach over a hypothetical shared coach with same key', () => {
    const sharedCoach = makeRow('coach_v3', 5, null, '[shared fallback coach]');
    const tenantCoach = makeRow('coach_v3', 5, TENANT_ID, '[tenant coach]');
    // Orden adverso a propósito: shared primero
    const out = buildComposedPrompt([...sharedRowsV4, sharedCoach, tenantCoach], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const coachBlock = out.blocks.find((b) => b.key === 'coach_v3')!;
    expect(coachBlock.text).toBe('[tenant coach]');
    expect(coachBlock.scope).toBe('tenant');
  });

  it('metadata.totalChars matches concatenated content length', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const expected = out.blocks.reduce((s, b) => s + b.text.length, 0);
    expect(out.metadata.totalChars).toBe(expected);
  });
});
