import type { ComposedPrompt, SystemContentBlock } from '@fyzon/prompt-composer';

/** Mensajes en el formato de la Messages API de Anthropic. */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Timestamp para ordenar (ms epoch). Solo informativo, no se manda al SDK. */
  timestampMs?: number;
}

/** Output estructurado del Generator (corresponde 1:1 con la tool `respond_as_setter`). */
export interface SetterToolOutput {
  /**
   * Respuesta cruda del setter al lead, antes de pasar por Judge y Splitter.
   * Pueden ir varios mensajes en uno separados por saltos de línea — el Splitter
   * los partirá en mensajes naturales 20-280 chars.
   */
  message_raw: string;
  /** Resumen breve (1-2 frases) de lo que el setter ha entendido del lead. */
  user_summary?: string;
  /** Estado de la conversación tras este turno. */
  conversation_status:
    | 'active'
    | 'qualified'
    | 'disqualified'
    | 'handoff'
    | 'paused';
  /**
   * Fase decidida tras este turno. 1..7 (1-3 setting normal, 4 puente,
   * 5 propuesta, 6 envío link, 7 cierre post-agenda / cualificación).
   */
  phase_decision: number;
  /** Recursos sugeridos a enviar (claves de `resources` por nombre, opcional). */
  resources_to_send?: string[];
  /** Si conversation_status == 'handoff', motivo. */
  handoff_cause?:
    | 'A_agenda'
    | 'B_derivacion'
    | 'C_descualificado'
    | 'D_espera'
    | 'E_error';
  /** Razonamiento corto del modelo (debug). No se envía al lead. */
  reasoning?: string;
  // Razonamiento estructurado por turno — se persiste en columnas
  // conversations.{emotion,problem,goal,urgency,next_action,
  // general_context,general_motivation}. Mostrado al trainer en el panel
  // /conversations → FunnelPhaseIndicator. Opcionales.
  /** Emoción dominante del lead en este turno. */
  emotion?: string;
  /** Dolor / problema concreto detectado. */
  problem?: string;
  /** Outcome / objetivo que el lead busca. */
  goal?: string;
  /** Nivel de urgencia + contexto. */
  urgency?: string;
  /** Próximo paso del setter. */
  next_action?: string;
  /** Contexto histórico acumulado (diferente del current_context por-turno). */
  general_context?: string;
  /** Motivación profunda / driver del lead. */
  general_motivation?: string;
  /**
   * Hito 10.6 — API Booking. Si presente y no vacío, el motor reservará la cita
   * vía GHL API tras este turno. Debe ser un ISO 8601 con offset (ej:
   * "2026-05-19T17:00:00+02:00") copiado de los slots que el setter tenía en
   * el system prompt. Si está vacío, undefined o el slot no matchea con uno
   * disponible, no se reserva nada (flow legacy de URL widget).
   */
  proposed_booking_slot?: string;
  /**
   * Hito 10.6.1 — Email capturado del lead en este turno. El motor:
   *  - persiste en leads.email
   *  - actualiza el contacto GHL via upsertContact (para que GHL pueda enviar
   *    email de confirmación al lead cuando se cree la cita)
   * Solo rellenado por el setter si el lead dio email en su último mensaje.
   */
  captured_lead_email?: string;
  /**
   * Hito 10.6.1 — Nombre real capturado del lead en este turno. El motor:
   *  - persiste en leads.first_name (si está vacío)
   *  - actualiza el contacto GHL via upsertContact
   * Útil cuando el handle IG/FB no es el nombre real (ej: caballo56 → María).
   */
  captured_lead_name?: string;
}

/** Input al Generator: todo lo que necesita para producir un turno. */
export interface GeneratorInput {
  tenantId: number;
  /** Si null, es una conversación nueva sin id todavía (caso raro de tests). */
  conversationId: number | null;
  /** Texto del último mensaje del lead. */
  userMessage: string;
  /** Fase activa antes de este turno (qué `fase_<N>_v3` cargar). */
  currentPhase: number;
  /** Historial previo (sin incluir userMessage). */
  history: ConversationMessage[];
  /**
   * Modelo Anthropic. Default `env.GENERATOR_MODEL` o `DEFAULT_GENERATOR_MODEL`
   * (ver `generator.ts`). Útil sobreescribir en tests / dev.
   */
  model?: string;
  /** Max tokens del response. Default 1024. */
  maxTokens?: number;
  /**
   * Hito 12.1 — Cap dinámico de mensajes por turno (1-4). El motor lo lee de
   * `trainer_preferences.preferences.aiMessagesPerTurnMax` y lo propaga al
   * Generator (para construir la tool con `maxLength` ajustado en `message_raw`)
   * y al Splitter (para limitar `maxItems` en su tool y respetar el cap).
   * Default `undefined` → cap 4 (baseline pre-Hito 12.1).
   */
  aiMessagesPerTurnMax?: 1 | 2 | 3 | 4;
  /**
   * Overrides que el motor inyecta al composer por turno (Cerebro v5).
   *
   * En v5 se eliminaron los flags `isHandoff/includeObjections/includeDescualificacion/includeOutputContract`:
   * los 11 bloques v4 se han consolidado en `core_v5_base` + `output_contract_v5`,
   * que se cargan SIEMPRE. El marker de fase activa pasa por `currentPhaseFocus`
   * + atributo XML `priority="active|reference"` dinámico (resuelto en el composer).
   */
  composeOverrides?: {
    /**
     * Cerebro v5 — Instrucción focal corta para la fase actual (~30-80 tokens).
     * Construida por el motor con `apps/motor-agente/src/lib/phase-focus.ts`
     * (`buildPhaseFocusInstruction(currentPhase, isHandoff)`). El composer la
     * inyecta en `{{current_phase_focus}}` del `core_v5_base`.
     */
    currentPhaseFocus?: string | null;
    /**
     * Hito 10 — URL trackable del calendario default ya construida por el caller
     * (motor) con `getTrackedCalendarUrl`. Si se pasa, se inyecta en
     * `trainerContext.trackedCalendarUrl` para resolver `{{tracked_calendar_url}}`
     * (típicamente en coach_v5 fase_6). Si null/undefined, composer cae al fallback legacy.
     */
    trackedCalendarUrl?: string | null;
    /**
     * Hito 10.6 — Slots disponibles del calendar para API booking, cargados por
     * el caller (motor) con `loadAvailableSlots`. Si se pasa, el composer
     * rellena `{{available_slots}}` con la lista markdown.
     */
    availableSlots?: Array<{ iso: string; humanLabel: string }> | null;
    /**
     * Hito 10.6.1 — Fecha actual (ISO YYYY-MM-DD). El composer la renderiza como
     * etiqueta humana es-ES en el placeholder `{{current_date}}`.
     */
    currentDateIso?: string | null;
    /**
     * Hito 10.6.1 — Estado del contacto del lead (nombre + email). Renderizado
     * en `{{lead_contact_status}}`.
     */
    leadContact?: { firstName: string | null; email: string | null } | null;
    /** Hito 11 — Etiqueta humana de la timezone del LEAD (ej: "hora Argentina"). */
    leadTimezoneLabel?: string | null;
    /** Hito 11 — Etiqueta humana de la timezone del TRAINER (ej: "hora España"). */
    trainerTimezoneLabel?: string | null;
    /**
     * Hito 12.1 — Texto markdown extra que se APPEND al final del system prompt
     * compuesto como bloque adicional OUT of cache. Usado por el motor para
     * inyectar la directiva dinámica de `mirror_lead` (detectAddressing del
     * último mensaje del lead → directiva tú/usted con cumplimiento estricto).
     * Si null/undefined/vacío, no se añade nada.
     */
    extraSystemSuffix?: string | null;
  };
}

export interface GeneratorUsage {
  /** Tokens de entrada NO cacheados (cuentan a 1x rate). */
  tokensInUncached: number;
  /** Tokens leídos del cache (descuento ~0.1x rate). */
  tokensInCacheRead: number;
  /** Tokens escritos al cache (~1.25x rate). */
  tokensInCacheWrite: number;
  /** Tokens de salida (10x rate vs uncached input). */
  tokensOut: number;
  /** Coste estimado en USD. */
  costUsd: number;
  /** Latencia total de la llamada en ms. */
  latencyMs: number;
  /** Stop reason del modelo. */
  stopReason: string | null;
}

export interface GeneratorOutput {
  setterOutput: SetterToolOutput;
  usage: GeneratorUsage;
  /** Metadatos del prompt compuesto (chars, breakpoints, bloques cargados). */
  composedPromptMeta: ComposedPrompt['metadata'];
  /** Modelo usado en la llamada. */
  model: string;
  /** ID de la fila en `llm_calls` (si se registró correctamente). */
  llmCallId?: number;
}

/** Tool definition compatible con Anthropic Messages API. */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Cache opcional (ahora no lo usamos). */
  cache_control?: { type: 'ephemeral' };
}

export type SystemContent = SystemContentBlock[];
