/**
 * Tipos del validador post-LLM (V0-V16).
 *
 * El validador es la RED DE SEGURIDAD final del pipeline. Corre tras Judge
 * y antes del Splitter. Sus violaciones son determinísticas (regex/heurísticas)
 * y no dependen de LLM — por tanto son baratas, predecibles y testeables.
 *
 * Diseño:
 *  - Cada regla es una función pura `(text, ctx) => RuleViolation | null`.
 *  - El runner devuelve el array completo de violaciones.
 *  - Severidad `error` debe bloquear el envío del mensaje (fallback a humano).
 *  - Severidad `warn` se loggea pero el mensaje sigue.
 */

export type Channel = 'whatsapp' | 'instagram' | 'facebook';

export interface ValidationContext {
  tenantId: number;
  conversationId: number | null;
  /** Fase activa 1..7 al evaluar este turno. */
  currentPhase: number;
  channel: Channel;
  /** Whitelist de emojis del coach. Si está vacía o null, todos permitidos. */
  emojisWhitelist?: string[] | null;
  /** Es el primer mensaje del bot en la conversación (no permite saludo repetido). */
  isFirstAssistantMessage?: boolean;
  /** Últimos N mensajes del bot para detectar repetición. */
  lastAssistantMessages?: string[];
  /** Locale principal del coach (es-VE, es-ES, etc.). Informativo. */
  locale?: string;
  /**
   * Hito 12.1 — Lista de palabras/frases prohibidas por el trainer
   * (sanitizadas: trim + lowercase). Si vacía o undefined, V17 no dispara.
   * El motor las carga de `trainer_preferences.preferences.forbiddenPhrases`.
   */
  forbiddenPhrases?: string[];
  /**
   * Hito 12.1 — Tratamiento ESPERADO del setter al lead (cumplimiento estricto).
   * 'tu' o 'usted' → V18 valida que el output coincide. undefined → V18 skipea
   * (caso 'mirror_lead': el motor inyecta directiva dinámica en system prompt
   * basada en `detectAddressing(lastLeadMessage)`, V18 no aplica porque la
   * "expectativa" depende del lead, no es estática).
   */
  expectedAddressing?: 'tu' | 'usted';
  /**
   * Hito 12.2 — Nombre del lead detectado en F0 (de `leads.parsed_name`). Si
   * presente, V19 cuenta sus menciones en este turno + `lastAssistantMessages`
   * y avisa si supera `leadNameMaxMentions`. Si null/undefined o vacío, V19
   * skipea silenciosamente (lead sin nombre usable o trainer en modo 'never').
   */
  leadParsedName?: string | null;
  /**
   * Hito 12.2 — Tope de menciones del nombre del lead permitidas en toda la
   * conversación (0-5, del JSONB `trainer_preferences.leadNameMaxMentions`).
   * V19 emite warn si las menciones acumuladas (este turno + historial bot)
   * superan este valor. Severidad 'warn' (no retry) por design: la heurística
   * es falible y el contexto puede justificar repetir.
   */
  leadNameMaxMentions?: number;
}

export interface RuleViolation {
  ruleId: string;
  description: string;
  severity: 'warn' | 'error';
  /** Fragmento del texto que dispara la regla (debug). */
  match?: string;
  /** Sugerencia de fix automático si aplica. */
  suggestion?: string;
}

export type RuleCheck = (text: string, ctx: ValidationContext) => RuleViolation | null;

export interface ValidationRule {
  id: string;
  description: string;
  /** Si la regla todavía no tiene heurística real (solo placeholder). */
  stub?: boolean;
  check: RuleCheck;
}

export interface ValidationResult {
  ok: boolean;
  /** True si hay alguna violación con severity='error'. */
  hasErrors: boolean;
  violations: RuleViolation[];
}

export interface ValidateOptions {
  /** Sustituye el set por defecto. */
  rules?: ValidationRule[];
  /** Solo correr reglas con estos ids (whitelist). */
  only?: string[];
  /** Saltar reglas con estos ids (blacklist). */
  skip?: string[];
}
