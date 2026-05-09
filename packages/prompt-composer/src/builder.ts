import type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
} from './types.js';

/**
 * Lista de block_keys que se requieren siempre para una composición válida.
 * Si falta uno de estos, la composición falla.
 *
 * Nota v4: el Cerebro es `core_v4_base`. El Coach sigue como `coach_v3` por compat
 * (los Coaches concretos no se han migrado a v4 todavía).
 */
const REQUIRED_BLOCK_KEYS = ['core_v4_base', 'coach_v3'] as const;

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
    isHandoff = false,
    includeObjections = true,
    includeDescualificacion = true,
    includeOutputContract = true,
    cacheStrategy = 'two-point',
    cacheTtl = '1h',
  } = options;

  if (currentPhase < 1 || currentPhase > 6) {
    throw new Error(`composePrompt: currentPhase must be 1..6, got ${currentPhase}`);
  }

  // Índice por block_key. Si hay duplicados (p.ej. core compartido y coach por tenant),
  // preferimos el que matchea tenant (scope tenant) sobre el compartido.
  const byKey = new Map<string, PromptBlockRow>();
  for (const r of rows) {
    const existing = byKey.get(r.block_key);
    if (!existing) {
      byKey.set(r.block_key, r);
      continue;
    }
    // Prefiere tenant especifico sobre shared
    const existingIsTenant = existing.tenant_id === tenantId;
    const incomingIsTenant = r.tenant_id === tenantId;
    if (incomingIsTenant && !existingIsTenant) {
      byKey.set(r.block_key, r);
    }
  }

  // Orden de inclusión (el orden en que aparecen en el system prompt final).
  // Bloques REQUERIDOS o ESTRUCTURALES (su ausencia rompe la composición o el flujo de fases).
  const wantedKeys: string[] = [
    'core_v4_base',
    'coach_v3',
    `fase_${currentPhase}_v4`,
  ];
  if (isHandoff) wantedKeys.push('handoff_v4');
  if (includeObjections) wantedKeys.push('objeciones_v4');
  if (includeDescualificacion) wantedKeys.push('descualificacion_v4');
  if (includeOutputContract) wantedKeys.push('output_contract_v4');

  // Bloques OPCIONALES (Sprint Alpha): si existen en BD para este tenant se incluyen,
  // si no, se omiten silenciosamente. NO son error.
  //   - admin_overrides_v1 va inmediatamente después del coach (sort=6 implícito).
  //   - trainer_prefs_v1   va al final, después de output_contract_v4 (sort=110 implícito).
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
    blocks.push({
      key,
      text: row.content,
      cached: false,
      scope: row.tenant_id === null ? 'shared' : 'tenant',
    });

    // Tras insertar 'coach_v3', si existe admin_overrides_v1 para este tenant, lo añadimos.
    if (key === 'coach_v3') {
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

  applyCacheStrategy(blocks, cacheStrategy);

  const systemContent: SystemContentBlock[] = blocks.map((b) => {
    const block: SystemContentBlock = { type: 'text', text: b.text };
    if (b.cached) {
      // Si TTL es '5m', no lo emitimos (default histórico de Anthropic).
      // Si es '1h', sí emitimos `ttl` para activar el cache extendido.
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
  // El breakpoint final se aplica al último bloque que NO sea trainer_prefs_v1.
  let lastCacheableIdx = blocks.length - 1;
  while (lastCacheableIdx >= 0 && blocks[lastCacheableIdx]!.key === 'trainer_prefs_v1') {
    lastCacheableIdx--;
  }

  if (strategy === 'single-point') {
    if (lastCacheableIdx >= 0) {
      blocks[lastCacheableIdx]!.cached = true;
    }
    return;
  }

  // two-point (default): breakpoint tras core_v4_base + breakpoint al final cacheable.
  const coreIdx = blocks.findIndex((b) => b.key === 'core_v4_base');
  if (coreIdx >= 0) {
    blocks[coreIdx]!.cached = true;
  }
  if (lastCacheableIdx > coreIdx) {
    blocks[lastCacheableIdx]!.cached = true;
  }
}
