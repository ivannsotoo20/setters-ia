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
   * Modelo Anthropic. Default `env.GENERATOR_MODEL` o `claude-sonnet-4-5`.
   * Útil sobreescribir en tests / dev.
   */
  model?: string;
  /** Max tokens del response. Default 1024. */
  maxTokens?: number;
  /**
   * Permite ajustar inclusión de bloques opcionales del Cerebro v4 en el composer.
   * Por defecto: handoff=false, objeciones=true, descualificacion=true, output_contract=true.
   */
  composeOverrides?: {
    isHandoff?: boolean;
    includeObjections?: boolean;
    includeDescualificacion?: boolean;
    includeOutputContract?: boolean;
    /**
     * Hito 10 — URL trackable del calendario default ya construida por el caller
     * (motor) con `getTrackedCalendarUrl`. Si se pasa, se inyecta en
     * `trainerContext.trackedCalendarUrl` para resolver `{{tracked_calendar_url}}`
     * en fase_6_v4. Si null/undefined, composer cae al fallback legacy.
     */
    trackedCalendarUrl?: string | null;
    /**
     * Hito 10.6 — Slots disponibles del calendar para API booking, cargados por
     * el caller (motor) con `loadAvailableSlots`. Si se pasa, el composer
     * rellena `{{available_slots}}` en fase_6_v4 con la lista markdown.
     * Si null/undefined o vacío, composer cae al fallback (= flow legacy widget).
     */
    availableSlots?: Array<{ iso: string; humanLabel: string }> | null;
    /**
     * Hito 10.6.1 — Fecha actual (ISO YYYY-MM-DD). El composer la renderiza como
     * etiqueta humana es-ES en el placeholder `{{current_date}}`. Sin esto el
     * LLM no sabe qué día es hoy y dice "mañana" sin verificar.
     */
    currentDateIso?: string | null;
    /**
     * Hito 10.6.1 — Estado del contacto del lead (nombre + email). El composer
     * los renderiza en `{{lead_contact_status}}` para que el setter sepa si
     * debe pedir nombre/email antes de proponer slots.
     */
    leadContact?: { firstName: string | null; email: string | null } | null;
    /**
     * Hito 11 — Etiqueta humana de la timezone del LEAD (ej: "hora Argentina").
     * El composer la inyecta en `{{lead_timezone_label}}` de fase_6_v4 para que
     * el setter siempre mencione la zona al proponer horas cuando el lead esté
     * en huso distinto al trainer.
     */
    leadTimezoneLabel?: string | null;
    /**
     * Hito 11 — Etiqueta humana de la timezone del TRAINER (ej: "hora España").
     * Inyectada en `{{trainer_timezone_label}}`. Útil para que el setter pueda
     * verbalizar el desfase si lo necesita.
     */
    trainerTimezoneLabel?: string | null;
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
