import type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
} from './types.js';

/**
 * Lista de block_keys que se requieren siempre para una composicion valida.
 * Si falta uno de estos, la composicion falla.
 */
const REQUIRED_BLOCK_KEYS = ['core_v3_base', 'coach_v3'] as const;

/**
 * Construye el system prompt a partir de un array de filas de prompt_blocks.
 *
 * Funcion pura: no toca DB, facil de testear.
 */
export function buildComposedPrompt(
  rows: PromptBlockRow[],
  options: ComposeOptions,
): ComposedPrompt {
  const {
    tenantId,
    currentPhase,
    isQualification = false,
    isHandoff = false,
    includePipeline = false,
    includeObjections = true,
    cacheStrategy = 'two-point',
  } = options;

  if (currentPhase < 1 || currentPhase > 6) {
    throw new Error(`composePrompt: currentPhase must be 1..6, got ${currentPhase}`);
  }

  // Indice por block_key. Si hay duplicados (p.ej. core compartido y coach por tenant),
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

  // Orden de inclusion (el orden en que aparecen en el system prompt final).
  const wantedKeys: string[] = [
    'core_v3_base',
    'coach_v3',
    `fase_${currentPhase}_v3`,
  ];
  if (isQualification) wantedKeys.push('cualificacion_v3');
  if (isHandoff) wantedKeys.push('handoff_v3');
  if (includePipeline) wantedKeys.push('pipeline_v3');
  if (includeObjections) wantedKeys.push('objeciones_v3');

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
  }

  if (missing.length > 0) {
    throw new Error(`composePrompt: missing blocks for current options: ${missing.join(', ')}`);
  }

  applyCacheStrategy(blocks, cacheStrategy);

  const systemContent: SystemContentBlock[] = blocks.map((b) => {
    const block: SystemContentBlock = { type: 'text', text: b.text };
    if (b.cached) block.cache_control = { type: 'ephemeral' };
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

  if (strategy === 'single-point') {
    // Solo cachea al final del prefix (todo el system menos el ultimo turno).
    blocks[blocks.length - 1]!.cached = true;
    return;
  }

  // two-point (default): breakpoint tras core_v3_base + breakpoint al final.
  const coreIdx = blocks.findIndex((b) => b.key === 'core_v3_base');
  if (coreIdx >= 0) {
    blocks[coreIdx]!.cached = true;
  }
  const lastIdx = blocks.length - 1;
  if (lastIdx > coreIdx) {
    blocks[lastIdx]!.cached = true;
  }
}
