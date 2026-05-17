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
