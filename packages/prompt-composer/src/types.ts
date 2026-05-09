/**
 * Tipos del prompt-composer.
 *
 * Arquitectura del system prompt compuesto (Fyzon Setters IA — Cerebro v4 + capas admin/trainer):
 *
 *   1. core_v4_base            (compartido, tenant_id IS NULL, sort=0)   — Cerebro del Setter completo
 *   2. coach_v3                (por tenant, sort=5)                       — Empresa/coach del trainer
 *   3. admin_overrides_v1      (por tenant, sort=6, OPCIONAL)             — Capa que SOLO el agency admin (Iván)
 *                                                                            mete por tenant. Instrucciones extra
 *                                                                            que el trainer no ve. Si no existe, se omite.
 *   4. fase_<N>_v4             (compartido, sort=10·N) según la fase activa F1..F6
 *   5. handoff_v4              (compartido, sort=90) si isHandoff
 *   6. objeciones_v4           (compartido, sort=70) si includeObjections (default true)
 *   7. descualificacion_v4     (compartido, sort=80) si includeDescualificacion (default true)
 *   8. output_contract_v4      (compartido, sort=100) si includeOutputContract (default true)
 *   9. trainer_prefs_v1        (por tenant, sort=110, OPCIONAL)           — Ajustes de superficie del trainer
 *                                                                            (toggles: doble interrogación, densidad
 *                                                                            emojis, +N preguntas antes cita…). Generado
 *                                                                            desde JSON cerrado. NO cacheado (cambia
 *                                                                            frecuentemente).
 *
 * Cache breakpoints (Anthropic `cache_control: { type: 'ephemeral' }`):
 *   - Breakpoint 1 al final de `core_v4_base`: cacheable universal (compartido entre tenants).
 *   - Breakpoint 2 al final del último bloque cacheable (= último bloque que NO sea trainer_prefs_v1):
 *     cache completo del prefix invariante durante la fase activa.
 *   - `trainer_prefs_v1` queda EXPLÍCITAMENTE FUERA del cache: cambia con cada toggle del trainer
 *     y pesa poco (~200-500 chars), no compensa cachearlo.
 *   - `admin_overrides_v1` SÍ entra dentro del cache window (forma parte del prefix invariante).
 *     Cambia solo cuando Iván lo edita, lo cual es raro.
 *
 * Historial y mensaje actual se pasan como `messages[]` y NUNCA van cacheados.
 *
 * Notas v4 vs v3:
 *   - `cualificacion_v3` desaparece: la cualificación general baja al Coach (D48).
 *   - `pipeline_v3` desaparece: el protocolo GHL sale del prompt (D39 punto 2).
 *   - Se añaden `descualificacion_v4` y `output_contract_v4` como bloques universales.
 *   - El Coach sigue como `coach_v3` por compat: el Coach es agnóstico a la versión
 *     del Cerebro y los Coaches concretos existentes (Pablo, ivan-dev) no se han migrado a v4.
 *
 * Notas Sprint Alpha (admin overrides + trainer prefs):
 *   - admin_overrides_v1 y trainer_prefs_v1 son OPCIONALES — su ausencia NO es error.
 *   - Solo se requieren `core_v4_base` + `coach_v3` (REQUIRED_BLOCK_KEYS).
 */

export interface ComposeOptions {
  tenantId: number;
  /** Fase activa 1..6 del protocolo de setting. */
  currentPhase: number;
  /** Incluir `handoff_v4`. */
  isHandoff?: boolean;
  /** Incluir `objeciones_v4` (Protocolo RAM universal). Por defecto `true`. */
  includeObjections?: boolean;
  /** Incluir `descualificacion_v4` (Protocolo cierre cálido universal). Por defecto `true`. */
  includeDescualificacion?: boolean;
  /** Incluir `output_contract_v4` (schema del output). Por defecto `true`. */
  includeOutputContract?: boolean;
  /**
   * Estrategia de cache breakpoints. Default `'two-point'`.
   * - `'two-point'`: breakpoint al final de core_v4_base + breakpoint al final del prefix.
   * - `'single-point'`: un solo breakpoint al final del prefix completo (menos cache hits pero más simple).
   * - `'none'`: sin cache (solo dev/debug).
   */
  cacheStrategy?: 'two-point' | 'single-point' | 'none';
  /**
   * TTL del cache de Anthropic para los breakpoints emitidos.
   * - `'5m'`: TTL corto (default histórico, antes de 2026-05). Cache write barato pero
   *   conversaciones donde el lead tarda > 5 min entre turnos pagan cold cada vez.
   * - `'1h'` (default actual): TTL extendido. Cache write ~2× más caro pero amortiza
   *   en cuanto la conversación dura más de 5 min, que es el caso real con humanos.
   *
   * Más detalle del trade-off económico en plan playful-petting-pine.md sección 3.5.
   */
  cacheTtl?: '5m' | '1h';
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
 * Tipamos mínimo sin importar @anthropic-ai/sdk para mantener el composer
 * agnóstico al SDK (agent-pipeline se encarga de mapearlo al SDK real).
 */
export interface SystemContentBlock {
  type: 'text';
  text: string;
  /**
   * Cache control de Anthropic. `ttl` opcional ('5m' default si se omite, '1h' si
   * se especifica). Aplica a Sonnet 4.5+ y Haiku 4.5+ (modelos que soportan
   * extended cache TTL).
   */
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
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
