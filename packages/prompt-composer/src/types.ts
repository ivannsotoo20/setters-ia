/**
 * Tipos del prompt-composer.
 *
 * Arquitectura del system prompt compuesto (Fyzon Setters IA):
 *
 *   1. core_v3_base          (compartido, tenant_id IS NULL, sort=0)
 *   2. coach_v3              (por tenant, sort=5)
 *   3. fase_<N>_v3           (compartido, sort=10·N) segun la fase activa
 *   4. cualificacion_v3      (compartido, sort=70) si isQualification
 *   5. handoff_v3            (compartido, sort=80) si isHandoff
 *   6. pipeline_v3           (compartido, sort=90) si includePipeline
 *   7. objeciones_v3         (compartido, sort=100) si includeObjections
 *
 * Cache breakpoints (Anthropic `cache_control: { type: 'ephemeral' }`):
 *   - Breakpoint 1 al final de `core_v3_base`: cacheable universal (compartido entre tenants).
 *   - Breakpoint 2 al final del ultimo bloque incluido: cache completo del prefix
 *     (invariante durante la fase activa).
 *
 * Historial y mensaje actual se pasan como `messages[]` y NUNCA van cacheados.
 */

export interface ComposeOptions {
  tenantId: number;
  /** Fase activa 1..6 del protocolo de setting. */
  currentPhase: number;
  /** Incluir `cualificacion_v3`. */
  isQualification?: boolean;
  /** Incluir `handoff_v3`. */
  isHandoff?: boolean;
  /** Incluir `pipeline_v3` (pipeline GHL). */
  includePipeline?: boolean;
  /** Incluir `objeciones_v3` (Bloque 7 RAM). Por defecto `true`. */
  includeObjections?: boolean;
  /**
   * Estrategia de cache breakpoints. Default `'two-point'`.
   * - `'two-point'`: breakpoint al final de core_v3_base + breakpoint al final del prefix.
   * - `'single-point'`: un solo breakpoint al final del prefix completo (menos cache hits pero mas simple).
   * - `'none'`: sin cache (solo dev/debug).
   */
  cacheStrategy?: 'two-point' | 'single-point' | 'none';
}

/** Una fila de `prompt_blocks` que el builder necesita para componer. */
export interface PromptBlockRow {
  block_key: string;
  content: string;
  sort_order: number;
  tenant_id: number | null;
}

export interface ComposedBlock {
  key: string;
  text: string;
  cached: boolean;
  /** Origen: compartido (tenant_id IS NULL) o por tenant. */
  scope: 'shared' | 'tenant';
}

/**
 * Bloque en el formato que espera la Messages API de Anthropic como
 * contenido del campo `system`.
 *
 * Tipamos minimo sin importar @anthropic-ai/sdk para mantener el composer
 * agnostico al SDK (agent-pipeline se encarga de mapearlo al SDK real).
 */
export interface SystemContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ComposedPrompt {
  /** Bloques normalizados con flag de cache. */
  blocks: ComposedBlock[];
  /** Listo para enviar como `system` a la Messages API de Anthropic. */
  systemContent: SystemContentBlock[];
  metadata: {
    tenantId: number;
    currentPhase: number;
    totalChars: number;
    blockCount: number;
    blocksLoaded: string[];
    cacheBreakpoints: number;
  };
}
