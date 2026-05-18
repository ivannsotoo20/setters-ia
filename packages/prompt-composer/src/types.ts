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
   * Sprint Gamma 2.6 — Datos del trainer para interpolar placeholders en bloques
   * shared del Cerebro (handoff_v4). Hoy solo `phone`. El composer reemplaza
   * `{{trainer_phone|fallback}}` por `phone` (si está) o `fallback` (si null).
   *
   * Si se omite, los placeholders se reemplazan por sus fallbacks (no quedan
   * `{{...}}` literales en el prompt — eso sería un bug que ensucia al modelo).
   */
  trainerContext?: TrainerContext;
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
  /**
   * Hito 10 — URL trackable del calendario default. Si presente, se inyecta en
   * `trainerContext.trackedCalendarUrl` antes de interpolar fase_6_v4. Si null
   * o ausente, el placeholder `{{tracked_calendar_url|fallback}}` cae a
   * `closingResourceUrl` legacy de trainer_preferences (compat MVP).
   *
   * El caller (motor pipeline) lo construye con `buildTrackedBookingUrl` antes
   * de llamar a composePrompt. Composer no computa nada — solo interpola.
   */
  trackedCalendarUrl?: string | null;
  /**
   * Hito 10.6 — Slots disponibles para API booking. Si presente y el tenant tiene
   * `useApiBooking=true`, el composer rellena `{{available_slots|fallback}}` en
   * fase_6_v4 con la lista markdown. Si null/ausente, cae al fallback (lo que
   * permite seguir usando el flow legacy de URL del widget).
   *
   * Cada slot tiene `iso` (lo que el LLM debe rellenar en `proposed_booking_slot`)
   * y `humanLabel` (lo que el LLM muestra al lead en chat).
   */
  availableSlots?: Array<{ iso: string; humanLabel: string }> | null;
  /**
   * Hito 10.6.1 — Fecha actual (ISO YYYY-MM-DD). El composer la renderiza como
   * etiqueta humana es-ES ("domingo 17 mayo 2026") en el placeholder
   * `{{current_date}}` de fase_6_v4. Sin esto el LLM dice "mañana" sin saber
   * qué día es realmente.
   */
  currentDateIso?: string | null;
  /**
   * Hito 10.6.1 — Datos de contacto del lead activo en la conv. El composer los
   * renderiza en `{{lead_contact_status}}` como bloque "Nombre: ✓ / Email: FALTA"
   * para que el setter sepa si tiene que pedir email o nombre antes de proponer
   * cita. Si null, el placeholder cae a fallback.
   */
  leadContact?: { firstName: string | null; email: string | null } | null;
  /**
   * Hito 11 — Etiqueta humana de la timezone del lead (ej: "hora Argentina").
   * Si presente, se inyecta en `{{lead_timezone_label}}` de fase_6_v4. Si null,
   * cae a fallback (typically "hora local").
   */
  leadTimezoneLabel?: string | null;
  /**
   * Hito 11 — Etiqueta humana de la timezone del trainer (ej: "hora España").
   * Si presente, se inyecta en `{{trainer_timezone_label}}` de fase_6_v4.
   */
  trainerTimezoneLabel?: string | null;
}

/**
 * Datos del trainer disponibles para interpolar en placeholders de bloques shared.
 * Se construye en `composePrompt` leyendo `trainer_preferences.preferences` JSONB
 * y se pasa a `buildComposedPrompt` como parte de `ComposeOptions.trainerContext`.
 */
export interface TrainerContext {
  /** E.164 (+34...). Reemplaza `{{trainer_phone|fallback}}`. */
  phone: string | null;
  /**
   * Sprint 2.6b — Configuración de Comportamiento en handoff (Causa B).
   * Si `enabled=false` (default), `{{handoff_directive}}` cae al render legacy
   * (compat Sprint 2.6 v2: comparte phone si lo hay, sino frase genérica).
   * Si `enabled=true`, se aplica `mode` + sub-config según modo.
   */
  handoff?: HandoffContext;
  /**
   * Hito 10 — URL trackable del calendario default para insertar en F6.
   * El caller (motor pipeline) la construye con `buildTrackedBookingUrl({calendar, lead})`
   * y la pasa aquí. Si null, `{{tracked_calendar_url|fallback}}` cae al fallback
   * (closingResourceUrl legacy de trainer_preferences si está, sino frase genérica).
   */
  trackedCalendarUrl?: string | null;
  /**
   * Hito 10.6 — Bloque markdown con los slots disponibles (ya renderizado).
   * Si null/empty, el placeholder `{{available_slots|fallback}}` cae al fallback.
   * Construido por el caller con `renderSlotsBlock(slots)`.
   */
  availableSlotsBlock?: string | null;
  /** Hito 10.6.1 — Fecha actual humana es-ES (ej: "domingo 17 mayo 2026"). */
  currentDateLabel?: string | null;
  /** Hito 10.6.1 — Bloque markdown con estado de contacto del lead. */
  leadContactStatusBlock?: string | null;
  /** Hito 11 — Etiqueta humana de la timezone del lead (ej: "hora Argentina"). */
  leadTimezoneLabel?: string | null;
  /** Hito 11 — Etiqueta humana de la timezone del trainer (ej: "hora España"). */
  trainerTimezoneLabel?: string | null;
}

export interface HandoffContext {
  enabled: boolean;
  mode: 'share_phone' | 'silent' | 'custom_message';
  template: 'warm' | 'professional' | 'free';
  customMessage: string | null;
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
