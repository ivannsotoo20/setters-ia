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

  it('applies two-point cache strategy by default (core_v4_base + last block cached) with TTL 1h', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v4_base', 'output_contract_v4']);
    expect(out.metadata.cacheBreakpoints).toBe(2);

    // Default cacheTtl = '1h' desde 2026-05-07 (ver plan playful-petting-pine.md §3.5).
    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
    expect(out.systemContent[1]!.cache_control).toBeUndefined(); // coach_v3 no cacheado en two-point
  });

  it('emits cache_control without ttl when cacheTtl is "5m"', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheTtl: '5m',
    });

    expect(out.systemContent[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(out.systemContent[out.systemContent.length - 1]!.cache_control).toEqual({
      type: 'ephemeral',
    });
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

describe('buildComposedPrompt — admin_overrides_v1 (Sprint Alpha)', () => {
  const adminOverridesRow = makeRow(
    'admin_overrides_v1',
    6,
    TENANT_ID,
    '[admin overrides para tenant 2]',
  );

  it('inserts admin_overrides_v1 immediately after coach_v3 when present for tenant', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, adminOverridesRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v4_base',
      'coach_v3',
      'admin_overrides_v1',
      'fase_2_v4',
      'objeciones_v4',
      'descualificacion_v4',
      'output_contract_v4',
    ]);
    const overridesBlock = out.blocks.find((b) => b.key === 'admin_overrides_v1')!;
    expect(overridesBlock.scope).toBe('tenant');
    expect(overridesBlock.text).toBe('[admin overrides para tenant 2]');
  });

  it('omits admin_overrides_v1 silently when not present (not an error)', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
    expect(out.blocks).toHaveLength(6);
  });

  it('ignores admin_overrides_v1 from a different tenant (security)', () => {
    const otherTenantOverrides = makeRow('admin_overrides_v1', 6, 999, '[other tenant overrides]');
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, otherTenantOverrides], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    expect(out.metadata.blocksLoaded).not.toContain('admin_overrides_v1');
  });

  it('admin_overrides_v1 is included inside the cache window (not extra breakpoint)', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, adminOverridesRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    const cached = out.blocks.filter((b) => b.cached);
    // two-point default: core + último bloque cacheable (output_contract_v4 aquí).
    expect(cached.map((b) => b.key)).toEqual(['core_v4_base', 'output_contract_v4']);
    const overridesBlock = out.blocks.find((b) => b.key === 'admin_overrides_v1')!;
    expect(overridesBlock.cached).toBe(false);
  });
});

describe('buildComposedPrompt — trainer_prefs_v1 (Sprint Alpha)', () => {
  const trainerPrefsRow = makeRow(
    'trainer_prefs_v1',
    110,
    TENANT_ID,
    '[trainer prefs serialized markdown]',
  );

  it('appends trainer_prefs_v1 at the end when present for tenant', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });

    expect(out.metadata.blocksLoaded).toEqual([
      'core_v4_base',
      'coach_v3',
      'fase_2_v4',
      'objeciones_v4',
      'descualificacion_v4',
      'output_contract_v4',
      'trainer_prefs_v1',
    ]);
    const lastBlock = out.blocks[out.blocks.length - 1]!;
    expect(lastBlock.key).toBe('trainer_prefs_v1');
    expect(lastBlock.scope).toBe('tenant');
  });

  it('omits trainer_prefs_v1 silently when not present', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    expect(out.metadata.blocksLoaded).not.toContain('trainer_prefs_v1');
  });

  it('ignores trainer_prefs_v1 from a different tenant (security)', () => {
    const otherPrefs = makeRow('trainer_prefs_v1', 110, 999, '[other tenant prefs]');
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, otherPrefs], {
      tenantId: TENANT_ID,
      currentPhase: 1,
    });
    expect(out.metadata.blocksLoaded).not.toContain('trainer_prefs_v1');
  });

  it('trainer_prefs_v1 is NEVER cached even with two-point strategy (cache breakpoint stays before it)', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
    });
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v4_base', 'output_contract_v4']);
    const prefsBlock = out.blocks.find((b) => b.key === 'trainer_prefs_v1')!;
    expect(prefsBlock.cached).toBe(false);
  });

  it('trainer_prefs_v1 is NEVER cached even with single-point strategy', () => {
    const out = buildComposedPrompt([...sharedRowsV4, coachRow, trainerPrefsRow], {
      tenantId: TENANT_ID,
      currentPhase: 2,
      cacheStrategy: 'single-point',
    });
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached).toHaveLength(1);
    expect(cached[0]!.key).toBe('output_contract_v4'); // último cacheable, no trainer_prefs
  });

  it('full stack: core + coach + admin_overrides + fase + objeciones + desc + output + trainer_prefs', () => {
    const adminOverridesRow = makeRow('admin_overrides_v1', 6, TENANT_ID);
    const out = buildComposedPrompt(
      [...sharedRowsV4, coachRow, adminOverridesRow, trainerPrefsRow],
      {
        tenantId: TENANT_ID,
        currentPhase: 3,
        isHandoff: true,
      },
    );
    expect(out.metadata.blocksLoaded).toEqual([
      'core_v4_base',
      'coach_v3',
      'admin_overrides_v1',
      'fase_3_v4',
      'handoff_v4',
      'objeciones_v4',
      'descualificacion_v4',
      'output_contract_v4',
      'trainer_prefs_v1',
    ]);
    // Cache: core + último cacheable (output_contract_v4, NO trainer_prefs).
    const cached = out.blocks.filter((b) => b.cached);
    expect(cached.map((b) => b.key)).toEqual(['core_v4_base', 'output_contract_v4']);
  });
});

// =============================================================================
// Sprint Gamma 2.6 — interpolación de placeholders del trainer en handoff_v4
// =============================================================================

describe('buildComposedPrompt — interpolación trainer_phone en handoff_v4 (Sprint Gamma 2.6)', () => {
  const handoffWithPlaceholder: PromptBlockRow = {
    block_key: 'handoff_v4',
    sort_order: 90,
    tenant_id: null,
    content:
      'Causa B: contacto del equipo: {{trainer_phone|(no configurado — frase genérica)}}',
  };

  const baseRows: PromptBlockRow[] = [
    makeRow('core_v4_base', 0, null),
    makeRow('fase_4_v4', 40, null),
    handoffWithPlaceholder,
    makeRow('objeciones_v4', 70, null),
    makeRow('descualificacion_v4', 80, null),
    makeRow('output_contract_v4', 100, null),
    coachRow,
  ];

  it('interpola {{trainer_phone}} con phone real cuando trainerContext.phone está set', () => {
    const out = buildComposedPrompt(baseRows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isHandoff: true,
      trainerContext: { phone: '+34659487594' },
    });
    const handoffBlock = out.blocks.find((b) => b.key === 'handoff_v4');
    expect(handoffBlock).toBeDefined();
    expect(handoffBlock!.text).toContain('+34659487594');
    expect(handoffBlock!.text).not.toContain('{{trainer_phone');
  });

  it('cae al fallback cuando trainerContext.phone es null', () => {
    const out = buildComposedPrompt(baseRows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isHandoff: true,
      trainerContext: { phone: null },
    });
    const handoffBlock = out.blocks.find((b) => b.key === 'handoff_v4');
    expect(handoffBlock!.text).toContain('(no configurado — frase genérica)');
    expect(handoffBlock!.text).not.toContain('{{trainer_phone');
  });

  it('cae al fallback cuando trainerContext NO se pasa (defensa por defecto)', () => {
    const out = buildComposedPrompt(baseRows, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isHandoff: true,
      // trainerContext omitido a propósito
    });
    const handoffBlock = out.blocks.find((b) => b.key === 'handoff_v4');
    expect(handoffBlock!.text).toContain('(no configurado — frase genérica)');
    expect(handoffBlock!.text).not.toContain('{{trainer_phone');
  });

  it('NO interpola en otros bloques (whitelist solo handoff_v4)', () => {
    // Reemplazo del coach por uno con placeholder (NO duplicar — el builder
    // resuelve byKey y solo se queda con el primero si hay tied tenant scope).
    const coachWithPlaceholder: PromptBlockRow = {
      block_key: 'coach_v3',
      sort_order: 5,
      tenant_id: TENANT_ID,
      content: 'Coach: {{trainer_phone|x}}',
    };
    const rowsWithFakePhones: PromptBlockRow[] = [
      ...baseRows.filter((r) => r.block_key !== 'coach_v3'),
      coachWithPlaceholder,
    ];
    const out = buildComposedPrompt(rowsWithFakePhones, {
      tenantId: TENANT_ID,
      currentPhase: 4,
      isHandoff: true,
      trainerContext: { phone: '+34600' },
    });
    const coachBlock = out.blocks.find((b) => b.key === 'coach_v3');
    // Coach NO se interpola — el `{{trainer_phone|x}}` queda literal
    expect(coachBlock!.text).toContain('{{trainer_phone|x}}');
    expect(coachBlock!.text).not.toContain('+34600');
    // Pero handoff SÍ se interpola
    const handoffBlock = out.blocks.find((b) => b.key === 'handoff_v4');
    expect(handoffBlock!.text).toContain('+34600');
  });

  it('handoff_v4 sin placeholder se queda intacto (no rompe bloques pre-Sprint-2.6)', () => {
    const handoffSinPlaceholder: PromptBlockRow = {
      block_key: 'handoff_v4',
      sort_order: 90,
      tenant_id: null,
      content: 'Protocolo handoff sin placeholders',
    };
    const out = buildComposedPrompt(
      [...baseRows.filter((r) => r.block_key !== 'handoff_v4'), handoffSinPlaceholder],
      {
        tenantId: TENANT_ID,
        currentPhase: 4,
        isHandoff: true,
        trainerContext: { phone: '+34600' },
      },
    );
    const handoffBlock = out.blocks.find((b) => b.key === 'handoff_v4');
    expect(handoffBlock!.text).toBe('Protocolo handoff sin placeholders');
  });
});
