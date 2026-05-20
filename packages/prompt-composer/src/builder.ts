import type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
} from './types.js';
import {
  interpolatePhasePriorities,
  interpolateTrainerPlaceholders,
} from './interpolate.js';

/**
 * Cerebro v5 — Bloques que llevan placeholders rich y deben pasar por interpolación.
 * Both el CORE y el COACH llevan placeholders (currentPhaseFocus, phase priorities,
 * tracked_calendar_url, available_slots, etc.).
 */
const INTERPOLATABLE_BLOCK_KEYS = new Set<string>(['core_v5_base', 'coach_v5']);

/**
 * Bloques requeridos para una composición v5 válida.
 * Si falta uno de estos, el builder falla con error explícito.
 *
 * - core_v5_base: cerebro shared consolidado (sort=0).
 * - coach_v5: voz/criterios del trainer (sort=5, por tenant).
 *
 * output_contract_v5 también es importante pero NO es estrictamente requerido
 * por el builder (el motor puede operar sin él temporalmente). Se incluye por
 * default en wantedKeys y si falta se reporta como missing.
 */
const REQUIRED_BLOCK_KEYS = ['core_v5_base', 'coach_v5'] as const;

/**
 * Construye el system prompt a partir de un array de filas de prompt_blocks.
 *
 * Función pura: no toca DB, fácil de testear.
 */
export function buildComposedPrompt(
  rows: PromptBlockRow[],
  options: ComposeOptions,
): ComposedPrompt {
  const {
    tenantId,
    currentPhase,
    cacheStrategy = 'two-point',
    cacheTtl = '1h',
    trainerContext,
  } = options;

  if (currentPhase < 1 || currentPhase > 6) {
    throw new Error(`composePrompt: currentPhase must be 1..6, got ${currentPhase}`);
  }

  // Índice por block_key. Si hay duplicados (p.ej. shared y tenant), preferir tenant.
  const byKey = new Map<string, PromptBlockRow>();
  for (const r of rows) {
    const existing = byKey.get(r.block_key);
    if (!existing) {
      byKey.set(r.block_key, r);
      continue;
    }
    const existingIsTenant = existing.tenant_id === tenantId;
    const incomingIsTenant = r.tenant_id === tenantId;
    if (incomingIsTenant && !existingIsTenant) {
      byKey.set(r.block_key, r);
    }
  }

  // Orden de inclusión final del system prompt (sort_order canónico):
  //   0   core_v5_base       (shared)
  //   5   coach_v5           (tenant)
  //   6   admin_overrides_v1 (tenant, opcional)
  //   100 output_contract_v5 (shared)
  //   110 trainer_prefs_v1   (tenant, opcional, fuera de cache)
  const wantedKeys: string[] = [
    'core_v5_base',
    'coach_v5',
    'output_contract_v5',
  ];

  const OPTIONAL_AFTER_COACH = 'admin_overrides_v1';
  const OPTIONAL_AT_END = 'trainer_prefs_v1';

  // Validar requeridos
  const missingRequired = REQUIRED_BLOCK_KEYS.filter((k) => !byKey.has(k));
  if (missingRequired.length > 0) {
    throw new Error(
      `composePrompt: missing required blocks: ${missingRequired.join(', ')}`,
    );
  }

  const missing: string[] = [];
  const blocks: ComposedBlock[] = [];
  for (const key of wantedKeys) {
    const row = byKey.get(key);
    if (!row) {
      missing.push(key);
      continue;
    }
    // Interpolación selectiva (whitelist):
    // - core_v5_base: {{current_phase_focus}} + phase priorities + handoff_directive
    //   + (placeholders del lead/trainer si el .md los usa).
    // - coach_v5: placeholders ricos del trainer que el .md utilice.
    let text = row.content;
    if (INTERPOLATABLE_BLOCK_KEYS.has(key)) {
      text = interpolateTrainerPlaceholders(text, trainerContext);
      // Phase priorities solo aplica al core_v5_base (las etiquetas <phaseN>
      // viven ahí). Aplicar al coach también es no-op (no contiene esos tokens).
      text = interpolatePhasePriorities(text, currentPhase);
    }
    blocks.push({
      key,
      text,
      cached: false,
      scope: row.tenant_id === null ? 'shared' : 'tenant',
    });

    // Tras insertar 'coach_v5', si existe admin_overrides_v1 para este tenant, lo añadimos.
    if (key === 'coach_v5') {
      const overridesRow = byKey.get(OPTIONAL_AFTER_COACH);
      if (overridesRow && overridesRow.tenant_id === tenantId) {
        blocks.push({
          key: OPTIONAL_AFTER_COACH,
          text: overridesRow.content,
          cached: false,
          scope: 'tenant',
        });
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`composePrompt: missing blocks for current options: ${missing.join(', ')}`);
  }

  // Al final de todo, si existe trainer_prefs_v1 para este tenant, lo añadimos.
  // OJO: queda fuera del cache (ver applyCacheStrategy).
  const prefsRow = byKey.get(OPTIONAL_AT_END);
  if (prefsRow && prefsRow.tenant_id === tenantId) {
    blocks.push({
      key: OPTIONAL_AT_END,
      text: prefsRow.content,
      cached: false,
      scope: 'tenant',
    });
  }

  // Hito 12.1 — Si el caller pasó `extraSystemSuffix` (no vacío), lo añadimos
  // como bloque sintético al final del array. Va OUT of cache porque típicamente
  // cambia turno a turno (p.ej. directiva de mirror_lead basada en el último
  // mensaje del lead). El `applyCacheStrategy` lo excluye del breakpoint final.
  const suffix = options.extraSystemSuffix;
  if (typeof suffix === 'string' && suffix.trim().length > 0) {
    blocks.push({
      key: 'extra_system_suffix',
      text: suffix,
      cached: false,
      scope: 'tenant',
    });
  }

  applyCacheStrategy(blocks, cacheStrategy);

  const systemContent: SystemContentBlock[] = blocks.map((b) => {
    const block: SystemContentBlock = { type: 'text', text: b.text };
    if (b.cached) {
      block.cache_control =
        cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    }
    return block;
  });

  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);

  return {
    blocks,
    systemContent,
    metadata: {
      tenantId,
      currentPhase,
      totalChars,
      blockCount: blocks.length,
      blocksLoaded: blocks.map((b) => b.key),
      cacheBreakpoints: blocks.filter((b) => b.cached).length,
    },
  };
}

function applyCacheStrategy(
  blocks: ComposedBlock[],
  strategy: 'two-point' | 'single-point' | 'none',
): void {
  if (blocks.length === 0 || strategy === 'none') return;

  // trainer_prefs_v1 NUNCA se cachea: cambia con cada toggle del trainer y pesa poco.
  // Hito 12.1 — extra_system_suffix tampoco se cachea: cambia turno a turno
  // (mirror_lead detecta el tratamiento del lead y construye directiva ad-hoc).
  // El breakpoint final se aplica al último bloque que NO sea OUT-of-cache.
  const OUT_OF_CACHE_KEYS = new Set(['trainer_prefs_v1', 'extra_system_suffix']);
  let lastCacheableIdx = blocks.length - 1;
  while (lastCacheableIdx >= 0 && OUT_OF_CACHE_KEYS.has(blocks[lastCacheableIdx]!.key)) {
    lastCacheableIdx--;
  }

  if (strategy === 'single-point') {
    if (lastCacheableIdx >= 0) {
      blocks[lastCacheableIdx]!.cached = true;
    }
    return;
  }

  // two-point (default): breakpoint tras core_v5_base + breakpoint al final cacheable.
  // Beneficio: cuando se edita el coach_v5 de un tenant, el core_v5_base sigue cacheado.
  const coreIdx = blocks.findIndex((b) => b.key === 'core_v5_base');
  if (coreIdx >= 0) {
    blocks[coreIdx]!.cached = true;
  }
  if (lastCacheableIdx > coreIdx) {
    blocks[lastCacheableIdx]!.cached = true;
  }
}
