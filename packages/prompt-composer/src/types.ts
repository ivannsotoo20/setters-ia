/**
 * Tipos del prompt-composer.
 *
 * Arquitectura del system prompt compuesto (Fyzon Setters IA — Cerebro v5):
 *
 *   1. core_v5_base            (compartido, tenant_id IS NULL, sort=0)   — Cerebro consolidado completo
 *                                                                            (módulo de jerarquía, identidad, propósito,
 *                                                                            mental model, critical_rules, conditional_rules,
 *                                                                            core_principles, tone, verbosity, final_instructions,
 *                                                                            las 6 fases inline, objections_protocol, protocolo_handoff)
 *   2. coach_v5                (por tenant, sort=5, REQUIRED)             — Voz/criterios/mensajes del trainer (monolítico inline)
 *   3. admin_overrides_v1      (por tenant, sort=6, OPCIONAL)             — Capa que SOLO el agency admin mete por tenant
 *   4. output_contract_v5      (compartido, sort=100)                     — Schema técnico del output JSON (SEPARADO del CORE)
 *   5. trainer_prefs_v1        (por tenant, sort=110, OPCIONAL)           — Markdown serializado del JSONB del trainer
 *                                                                            (toggles: emojis, callProposalMode, schedulingMode,
 *                                                                            handoffMode, etc.). NO cacheado (cambia con cada toggle).
 *
 * Cache breakpoints (Anthropic `cache_control: { type: 'ephemeral' }`):
 *   - `two-point` (default): breakpoint tras `core_v5_base` (cachea cerebro universal) +
 *     breakpoint tras el último bloque cacheable (cachea el prefix invariante de la conversación).
 *   - `trainer_prefs_v1` queda EXPLÍCITAMENTE FUERA del cache: cambia con cada toggle del trainer
 *     y pesa poco (~200-500 chars), no compensa cachearlo.
 *   - `admin_overrides_v1` SÍ entra dentro del cache window (forma parte del prefix invariante).
 *     Cambia solo cuando Iván lo edita.
 *
 * Historial y mensaje actual se pasan como `messages[]` y NUNCA van cacheados.
 *
 * Notas v5 vs v4:
 *   - Las 11 fuentes shared del v4 (core_v4_base + 6×fase_N_v4 + objeciones + descualificacion + handoff + output_contract)
 *     se consolidan en 2 bloques shared: `core_v5_base` + `output_contract_v5`.
 *   - El filtro dinámico de fase desaparece: el CORE describe las 6 fases inline siempre.
 *   - Marker dinámico de fase activa (coste extra ≈ 0 tokens):
 *     · `{{current_phase_focus}}` — placeholder rich con instrucción focal corta por turno.
 *     · `priority="{{phase1_priority|reference}}"` … `priority="{{phase6_priority|reference}}"` —
 *        solo la fase actual lleva `priority="active"`.
 *   - `coach_v3` queda inactivo (migration 059). El slug v5 unifica naming.
 *   - `INTERPOLATABLE_BLOCK_KEYS` ahora incluye los 2 bloques que llevan placeholders ricos:
 *     `['core_v5_base', 'coach_v5']`.
 */

export interface ComposeOptions {
  tenantId: number;
  /** Fase activa 1..6 del protocolo de setting. Inyectada por el motor por turno. */
  currentPhase: number;
  /**
   * Instrucción focal corta de la fase activa (30-80 tokens). El motor (helper
   * `apps/motor-agente/src/lib/phase-focus.ts`) la construye según `currentPhase`
   * + `isHandoff` y la pasa aquí. El composer la inyecta en `{{current_phase_focus}}`
   * del `core_v5_base`.
   *
   * Si se omite, el placeholder cae al fallback genérico definido en el .md.
   */
  currentPhaseFocus?: string | null;
  /**
   * Estrategia de cache breakpoints. Default `'two-point'`.
   * - `'two-point'`: breakpoint al final de core_v5_base + breakpoint al final del prefix cacheable.
   * - `'single-point'`: un solo breakpoint al final del prefix completo.
   * - `'none'`: sin cache (solo dev/debug).
   */
  cacheStrategy?: 'two-point' | 'single-point' | 'none';
  /**
   * Datos del trainer para interpolar placeholders rich en bloques shared.
   * Si se omite, los placeholders se reemplazan por sus fallbacks (nunca quedan
   * `{{...}}` literales en el prompt enviado al modelo).
   */
  trainerContext?: TrainerContext;
  /**
   * TTL del cache de Anthropic para los breakpoints emitidos.
   * - `'5m'`: TTL corto (cache write barato pero conversaciones largas pagan cold).
   * - `'1h'` (default): TTL extendido (cache write ~2× más caro pero amortiza en
   *   cuanto la conversación dura más de 5 min).
   */
  cacheTtl?: '5m' | '1h';
  /**
   * Hito 10 — URL trackable del calendario default. Si presente, se inyecta en
   * `trainerContext.trackedCalendarUrl`. Si null o ausente, el placeholder
   * `{{tracked_calendar_url|fallback}}` cae a `closingResourceUrl` legacy de
   * trainer_preferences (compat MVP).
   */
  trackedCalendarUrl?: string | null;
  /**
   * Hito 10.6 — Slots disponibles para API booking. Si presente y el tenant tiene
   * `useApiBooking=true`, el composer rellena `{{available_slots|fallback}}` en
   * `coach_v5` con la lista markdown.
   */
  availableSlots?: Array<{ iso: string; humanLabel: string }> | null;
  /**
   * Hito 10.6.1 — Fecha actual (ISO YYYY-MM-DD). El composer la renderiza como
   * etiqueta humana es-ES ("domingo 17 mayo 2026") en `{{current_date}}`.
   */
  currentDateIso?: string | null;
  /**
   * Hito 10.6.1 — Datos de contacto del lead activo. El composer los renderiza
   * en `{{lead_contact_status}}` como bloque "Nombre: ✓ / Email: FALTA".
   */
  leadContact?: { firstName: string | null; email: string | null } | null;
  /**
   * Hito 11 — Etiqueta humana de la timezone del lead (ej: "hora Argentina").
   * Si presente, se inyecta en `{{lead_timezone_label}}`.
   */
  leadTimezoneLabel?: string | null;
  /**
   * Hito 11 — Etiqueta humana de la timezone del trainer (ej: "hora España").
   * Si presente, se inyecta en `{{trainer_timezone_label}}`.
   */
  trainerTimezoneLabel?: string | null;
  /**
   * Hito 12.1 — Texto markdown extra que se APPEND al final del system prompt
   * compuesto, como bloque adicional OUT of cache. Útil para directivas
   * dinámicas que el caller construye por turno y NO viven en `prompt_blocks`
   * (p.ej. el `buildMirrorLeadDirective` cuando `addressingMode='mirror_lead'`).
   *
   * Si `null` o `undefined`, no se agrega bloque extra. Si string vacío, igual.
   */
  extraSystemSuffix?: string | null;
  /**
   * Hito 12.2 — Resultado de la inferencia nombre + género del lead (persistido
   * en `leads` por `services/lead-inference.ts`). Si presente, el composer
   * construye la directiva de personalización por nombre y, si hay mismatch
   * con `targetClientGender` del trainer, también la directiva de verificación.
   *
   * Si `null` o `undefined`, el composer lo carga vía supabase (lookup extra)
   * usando `leadId`. Si `leadId` también ausente → ambas directivas caen a
   * "no menciones nombre / no preguntes por género".
   */
  leadInference?: LeadInferenceContext | null;
  /**
   * Hito 12.2 — ID del lead activo. Necesario para carga lazy de `leads` si
   * `leadInference` no se pasa explícito. El motor lo conoce desde el flujo
   * de pipeline (`process-debounced.ts` carga el lead row antes de generator).
   */
  leadId?: number | null;
}

/**
 * Hito 12.2 — Estado de inferencia del lead que el composer usa para
 * construir las directivas de personalización (nombre) y verificación
 * (género opuesto). Se carga de `leads.parsed_name` + `leads.parsed_name_status`
 * + `leads.detected_gender`.
 */
export interface LeadInferenceContext {
  parsedName: string | null;
  parsedNameStatus: 'usable' | 'not_usable' | 'unknown' | null;
  detectedGender: 'male' | 'female' | 'ambiguous' | 'unknown' | null;
}

/**
 * Datos del trainer disponibles para interpolar en placeholders de bloques shared/tenant.
 * Se construye en `composePrompt` leyendo `trainer_preferences.preferences` JSONB
 * + opciones explícitas del caller (motor pipeline).
 */
export interface TrainerContext {
  /** E.164 (+34...). Reemplaza `{{trainer_phone|fallback}}`. */
  phone: string | null;
  /**
   * Sprint 2.6b — Configuración de Comportamiento en handoff (Causa B).
   * Si `enabled=false` (default), `{{handoff_directive}}` cae al render legacy.
   * Si `enabled=true`, se aplica `mode` + sub-config según modo.
   */
  handoff?: HandoffContext;
  /**
   * Cerebro v5 — Instrucción focal corta de la fase activa que se inyecta en
   * `{{current_phase_focus}}` del `core_v5_base`. La construye el motor en
   * `apps/motor-agente/src/lib/phase-focus.ts`.
   */
  currentPhaseFocus?: string | null;
  /**
   * Hito 10 — URL trackable del calendario default para insertar en F6.
   */
  trackedCalendarUrl?: string | null;
  /**
   * Hito 10.6 — Bloque markdown con los slots disponibles (ya renderizado).
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
  /**
   * Hito 12.2 — Directiva markdown completa de personalización con el nombre
   * del lead. La construye el composer a partir de `leadInference` +
   * `trainer_preferences.useLeadNameMode` + `leadNameMaxMentions`. Se inyecta
   * en `{{lead_addressing_directive|fallback}}` del `core_v5_base`.
   *
   * Si null o ausente, el placeholder cae al fallback genérico (string vacío
   * o instrucción "no menciones nombre").
   */
  leadAddressingDirective?: string | null;
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
