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

// Cerebro v5 — 2 bloques shared (consolidación de los 11 v4 anteriores).
const sharedRowsV5: PromptBlockRow[] = [
  makeRow('core_v5_base', 0, null),
  makeRow('output_contract_v5', 100, null),
];

const coachRow: PromptBlockRow = makeRow('coach_v5', 5, TENANT_ID);

describe('buildComposedPrompt (Cerebro v5)', () => {
  it('composes default prompt with core_v5_base + coach_v5 + output_contract_v5', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v5_base',
      'coach_v5',
      'output_contract_v5',
    ]);
    expect(out.blocks).toHaveLength(3);
    expect(out.blocks[0]!.scope).toBe('shared'); // core
    expect(out.blocks[1]!.scope).toBe('tenant'); // coach
    expect(out.blocks[2]!.scope).toBe('shared'); // output_contract
  });

  it('applies two-point cache strategy by default (core + last cacheable) with TTL 1h', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v5_base', 'output_contract_v5']);
    expect(out.metadata.cacheBreakpoints).toBe(2);

    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
    expect(out.systemContent[1]!.cache_control).toBeUndefined(); // coach_v5 no cacheado en two-point
  });

  it('emits cache_control without ttl when cacheTtl is "5m"', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheTtl: '5m',
    });

    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('single-point strategy caches only the last cacheable block', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'single-point',
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached).toHaveLength(1);
    expect(cached[0]!.key).toBe('output_contract_v5');
  });

  it('none strategy emits zero cache_control markers', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'none',
    });

    expect(out.metadata.cacheBreakpoints).toBe(0);
    for (const b of out.systemContent) {
      expect(b.cache_control).toBeUndefined();
    }
  });

  it('throws when coach_v5 is missing', () => {
    expect(() =>
      buildComposedPrompt(sharedRowsV5, {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: coach_v5/);
  });

  it('throws when core_v5_base is missing', () => {
    const rowsNoCore = sharedRowsV5.filter((r) => r.block_key !== 'core_v5_base');
    expect(() =>
      buildComposedPrompt([...rowsNoCore, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing required blocks: core_v5_base/);
  });

  it('reports output_contract_v5 as missing in missing blocks error when absent', () => {
    const rowsNoOutput = sharedRowsV5.filter((r) => r.block_key !== 'output_contract_v5');
    expect(() =>
      buildComposedPrompt([...rowsNoOutput, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 1,
      }),
    ).toThrow(/missing blocks for current options: output_contract_v5/);
  });

  it('rejects out-of-range currentPhase', () => {
    expect(() =>
      buildComposedPrompt([...sharedRowsV5, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 7,
      }),
    ).toThrow(/currentPhase must be 1..6/);
    expect(() =>
      buildComposedPrompt([...sharedRowsV5, coachRow], {
        tenantId: TENANT_ID,
        currentPhase: 0,
      }),
    ).toThrow(/currentPhase must be 1..6/);
  });

  it('picks tenant coach_v5 over a hypothetical shared coach_v5 with same key', () => {
    const sharedCoach = makeRow('coach_v5', 5, null, '[shared fallback coach]');
    const tenantCoach = makeRow('coach_v5', 5, TENANT_ID, '[tenant coach]');
    const out = buildComposedPrompt([...sharedRowsV5, sharedCoach, tenantCoach], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const coachBlock = out.blocks.find((b) => b.key === 'coach_v5')!;
    expect(coachBlock.text).toBe('[tenant coach]');
    expect(coachBlock.scope).toBe('tenant');
  });

  it('metadata.totalChars matches concatenated content length', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    const expected = out.blocks.reduce((s, b) => s + b.text.length, 0);
    expect(out.metadata.totalChars).toBe(expected);
  });
});

describe('buildComposedPrompt — admin_overrides_v1', () => {
  const adminOverridesRow = makeRow(
    'admin_overrides_v1',
    6,
    TENANT_ID,
    '[admin overrides para tenant 2]',
  );

  it('inserts admin_overrides_v1 immediately after coach_v5 when present for tenant', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, adminOverridesRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v5_base',
      'coach_v5',
      'admin_overrides_v1',
      'output_contract_v5',
    ]);
    const overridesBlock = out.blocks.find((b) => b.key === 'admin_overrides_v1')!;
    expect(overridesBlock.scope).toBe('tenant');
    expect(overridesBlock.text).toBe('[admin overrides para tenant 2]');
  });

  it('omits admin_overrides_v1 silently when not present (not an error)', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
    expect(out.blocks).toHaveLength(3);
  });

  it('omits admin_overrides_v1 when content is empty (defensa Claude API)', () => {
    // Repro bug producción 2026-05-25: admin_overrides id=29 tenant=2 quedó con
    // content='' is_active=true. El composer lo añadía y Claude API rechazaba
    // con 400 "system: text content blocks must be non-empty". Tras el fix,
    // un bloque admin_overrides con content vacío se omite silenciosamente.
    const emptyOverrides = makeRow('admin_overrides_v1', 6, TENANT_ID, '');
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, emptyOverrides], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
    const overridesBlock = out.blocks.find((b) => b.key === 'admin_overrides_v1');
    expect(overridesBlock).toBeUndefined();
  });

  it('omits admin_overrides_v1 when content is whitespace only', () => {
    const whitespaceOverrides = makeRow('admin_overrides_v1', 6, TENANT_ID, '   \n  \t ');
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, whitespaceOverrides], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
  });

  it('ignores admin_overrides_v1 from a different tenant (security)', () => {
    const otherTenantOverrides = makeRow('admin_overrides_v1', 6, 999, '[other tenant overrides]');
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, otherTenantOverrides], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
  });

  it('admin_overrides_v1 is included inside the cache window (not extra breakpoint)', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, adminOverridesRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    const cached = out.blocks.filter((b) => b.cached);
    // two-point default: core + último cacheable (output_contract_v5).
    expect(cached.map((b) => b.key)).toEqual(['core_v5_base', 'output_contract_v5']);
    const overridesBlock = out.blocks.find((b) => b.key === 'admin_overrides_v1')!;
    expect(overridesBlock.cached).toBe(false);
  });
});

describe('buildComposedPrompt — trainer_prefs_v1', () => {
  const trainerPrefsRow = makeRow(
    'trainer_prefs_v1',
    110,
    TENANT_ID,
    '[trainer prefs serialized markdown]',
  );

  it('appends trainer_prefs_v1 at the end when present for tenant', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v5_base',
      'coach_v5',
      'output_contract_v5',
      'trainer_prefs_v1',
    ]);
    const lastBlock = out.blocks[out.blocks.length - 1]!;
    expect(lastBlock.key).toBe('trainer_prefs_v1');
    expect(lastBlock.scope).toBe('tenant');
  });

  it('omits trainer_prefs_v1 silently when not present', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    expect(out.metadata.blocksLoaded).not.toContain('trainer_prefs_v1');
  });

  it('omits trainer_prefs_v1 when content is empty (defensa Claude API)', () => {
    const emptyPrefs = makeRow('trainer_prefs_v1', 110, TENANT_ID, '');
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, emptyPrefs], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    expect(out.metadata.blocksLoaded).not.toContain('trainer_prefs_v1');
  });

  it('ignores trainer_prefs_v1 from a different tenant (security)', () => {
    const otherPrefs = makeRow('trainer_prefs_v1', 110, 999, '[other tenant prefs]');
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, otherPrefs], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    expect(out.metadata.blocksLoaded).not.toContain('trainer_prefs_v1');
  });

  it('trainer_prefs_v1 is NEVER cached even with two-point strategy', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v5_base', 'output_contract_v5']);
    const prefsBlock = out.blocks.find((b) => b.key === 'trainer_prefs_v1')!;
    expect(prefsBlock.cached).toBe(false);
  });

  it('trainer_prefs_v1 is NEVER cached even with single-point strategy', () => {
    const out = buildComposedPrompt([...sharedRowsV5, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'single-point',
    });
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached).toHaveLength(1);
    expect(cached[0]!.key).toBe('output_contract_v5');
  });

  it('full stack: core + coach + admin_overrides + output + trainer_prefs', () => {
    const adminOverridesRow = makeRow('admin_overrides_v1', 6, TENANT_ID);
    const out = buildComposedPrompt(
      [...sharedRowsV5, coachRow, adminOverridesRow, trainerPrefsRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 3,
      },
    );
    expect(out.metadata.blocksLoaded).toEqual([
      'core_v5_base',
      'coach_v5',
      'admin_overrides_v1',
      'output_contract_v5',
      'trainer_prefs_v1',
    ]);
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v5_base', 'output_contract_v5']);
  });
});

// =============================================================================
// Cerebro v5 — interpolación de current_phase_focus + phase priorities
// =============================================================================

describe('buildComposedPrompt — current_phase_focus interpolation (Cerebro v5)', () => {
  const coreWithFocus: PromptBlockRow = {
    block_key: 'core_v5_base',
    sort_order: 0,
    tenant_id: null,
    content:
      '<current_phase_focus>{{current_phase_focus|fallback genérico de fase}}</current_phase_focus>',
  };

  it('inserts currentPhaseFocus from trainerContext into core_v5_base', () => {
    const out = buildComposedPrompt(
      [coreWithFocus, sharedRowsV5[1]!, coachRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 3,
        trainerContext: { phone: null, currentPhaseFocus: 'AHORA EN FASE 3 — CUALIFICACIÓN' },
      },
    );
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base')!;
    expect(coreBlock.text).toContain('AHORA EN FASE 3 — CUALIFICACIÓN');
    expect(coreBlock.text).not.toContain('{{current_phase_focus');
  });

  it('falls back to default text when currentPhaseFocus is null', () => {
    const out = buildComposedPrompt(
      [coreWithFocus, sharedRowsV5[1]!, coachRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 3,
        trainerContext: { phone: null, currentPhaseFocus: null },
      },
    );
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base')!;
    expect(coreBlock.text).toContain('fallback genérico de fase');
    expect(coreBlock.text).not.toContain('{{current_phase_focus');
  });

  it('falls back to default text when trainerContext is omitted', () => {
    const out = buildComposedPrompt([coreWithFocus, sharedRowsV5[1]!, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 3,
    });
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base')!;
    expect(coreBlock.text).toContain('fallback genérico de fase');
    expect(coreBlock.text).not.toContain('{{current_phase_focus');
  });
});

describe('buildComposedPrompt — phase priority XML interpolation (Cerebro v5)', () => {
  const coreWithPriorities: PromptBlockRow = {
    block_key: 'core_v5_base',
    sort_order: 0,
    tenant_id: null,
    content: [
      '<phase1 priority="{{phase1_priority|reference}}">F1</phase1>',
      '<phase2 priority="{{phase2_priority|reference}}">F2</phase2>',
      '<phase3 priority="{{phase3_priority|reference}}">F3</phase3>',
      '<phase4 priority="{{phase4_priority|reference}}">F4</phase4>',
      '<phase5 priority="{{phase5_priority|reference}}">F5</phase5>',
      '<phase6 priority="{{phase6_priority|reference}}">F6</phase6>',
    ].join('\n'),
  };

  it('marks only the active phase with priority="active", rest with reference', () => {
    const out = buildComposedPrompt(
      [coreWithPriorities, sharedRowsV5[1]!, coachRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 3,
      },
    );
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base')!;
    expect(coreBlock.text).toContain('<phase3 priority="active">');
    // Las otras 5 fases caen al fallback reference
    expect(coreBlock.text).toContain('<phase1 priority="reference">');
    expect(coreBlock.text).toContain('<phase2 priority="reference">');
    expect(coreBlock.text).toContain('<phase4 priority="reference">');
    expect(coreBlock.text).toContain('<phase5 priority="reference">');
    expect(coreBlock.text).toContain('<phase6 priority="reference">');
    // Ningún placeholder literal
    expect(coreBlock.text).not.toContain('{{phase');
  });

  it('applies to phase 6 correctly', () => {
    const out = buildComposedPrompt(
      [coreWithPriorities, sharedRowsV5[1]!, coachRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 6,
      },
    );
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base')!;
    expect(coreBlock.text).toContain('<phase6 priority="active">');
    expect(coreBlock.text).toContain('<phase1 priority="reference">');
    expect(coreBlock.text).not.toContain('{{phase');
  });
});

// =============================================================================
// Sprint Gamma 2.6 — interpolación de placeholders del trainer (compat preservada)
// =============================================================================

describe('buildComposedPrompt — interpolación trainer_phone (compat Sprint Gamma 2.6)', () => {
  const coreWithPlaceholder: PromptBlockRow = {
    block_key: 'core_v5_base',
    sort_order: 0,
    tenant_id: null,
    content:
      'Causa B: contacto del equipo: {{trainer_phone|(no configurado — frase genérica)}}',
  };

  const baseRows: PromptBlockRow[] = [
    coreWithPlaceholder,
    makeRow('output_contract_v5', 100, null),
    coachRow,
  ];

  it('interpola {{trainer_phone}} con phone real cuando trainerContext.phone está set', () => {
    const out = buildComposedPrompt(baseRows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      trainerContext: { phone: '+34659487594' },
    });
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base');
    expect(coreBlock).toBeDefined();
    expect(coreBlock!.text).toContain('+34659487594');
    expect(coreBlock!.text).not.toContain('{{trainer_phone');
  });

  it('cae al fallback cuando trainerContext.phone es null', () => {
    const out = buildComposedPrompt(baseRows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      trainerContext: { phone: null },
    });
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base');
    expect(coreBlock!.text).toContain('(no configurado — frase genérica)');
    expect(coreBlock!.text).not.toContain('{{trainer_phone');
  });

  it('interpola también en coach_v5 (ambos bloques son interpolables en v5)', () => {
    const coachWithPlaceholder: PromptBlockRow = {
      block_key: 'coach_v5',
      sort_order: 5,
      tenant_id: TENANT_ID,
      content: 'Coach: {{trainer_phone|x}}',
    };
    const rows: PromptBlockRow[] = [
      makeRow('core_v5_base', 0, null),
      makeRow('output_contract_v5', 100, null),
      coachWithPlaceholder,
    ];
    const out = buildComposedPrompt(rows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      trainerContext: { phone: '+34600' },
    });
    const coachBlock = out.blocks.find((b) => b.key === 'coach_v5');
    expect(coachBlock!.text).toContain('+34600');
    expect(coachBlock!.text).not.toContain('{{trainer_phone');
  });

  it('bloques sin placeholder se quedan intactos', () => {
    const coreSinPlaceholder: PromptBlockRow = {
      block_key: 'core_v5_base',
      sort_order: 0,
      tenant_id: null,
      content: 'Core sin placeholders',
    };
    const out = buildComposedPrompt(
      [coreSinPlaceholder, makeRow('output_contract_v5', 100, null), coachRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 4,
        trainerContext: { phone: '+34600' },
      },
    );
    const coreBlock = out.blocks.find((b) => b.key === 'core_v5_base');
    expect(coreBlock!.text).toBe('Core sin placeholders');
  });
});
