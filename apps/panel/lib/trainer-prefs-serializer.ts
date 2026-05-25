/**
 * Serializa preferencias estructuradas del trainer a markdown que se inserta
 * como `prompt_blocks.block_key='trainer_prefs_v1'` (sort_order=110, al final
 * del prompt compuesto).
 *
 * Schema CERRADO: solo los campos aquí definidos pueden persistirse. Cualquier
 * otra clave en el JSON de entrada se ignora silenciosamente.
 *
 * Validación a mano (sin Zod) para no añadir dependencias nuevas al panel.
 *
 * Plan: ~/.claude/plans/admin-edita-cerebro-coach-prefs-2026-05-09.md
 *
 * Sprint Gamma 2.1: NUEVOS campos en JSONB
 *   - trainerEmail / trainerPhone / trainerName: datos de contacto. NO se
 *     serializan al markdown del prompt — viven en BD para inyección dinámica
 *     via placeholder en handoff_v4 (Sprint Gamma 2.6).
 *
 * Sprint Gamma 2.3: instrucciones libres como entidad separada
 *   - Las "instrucciones libres" del trainer ya NO viven en preferences (JSONB)
 *     sino en la tabla `trainer_custom_instructions` (1 row por instrucción,
 *     editable/borrable individual). Pasan a serializeTrainerPreferences como
 *     argumento `customInstructions: string[]` para concatenarlas como bullets
 *     en el markdown.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Phone E.164: + obligatorio + 8-15 dígitos. Acepta espacios/guiones en input,
// pero el normalizer los strippea.
const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

const MAX_TRAINER_NAME_CHARS = 100;
const MAX_CUSTOM_EMOJIS = 8;
const MAX_EMOJI_CHARS = 8; // permite ZWJ sequences como "👨‍👩‍👧" (varios codepoints)
const MAX_EMOJI_DESCRIPTION_CHARS = 100;

/**
 * Sprint 2.5b/E — Customización de un emoji individual del trainer:
 *   - emoji: 1-8 chars (acepta ZWJ sequences).
 *   - whenToUse: descripción 1-100 chars de cuándo usarlo (sanitizada).
 */
export interface EmojiCustomization {
  emoji: string;
  whenToUse: string;
}

export interface TrainerPreferences {
  // ----- Sprint Gamma 1 + 2.5b: estilo -----
  // NOTA Sprint 2.5b/A: `doubleQuestionMark` y `preferVoiceNotesAcknowledgment`
  // se eliminaron del schema porque son universalmente deseables (cualquier
  // trainer los querría). Las directrices se emiten siempre desde el serializer.
  // Datos viejos en JSONB con esas claves se ignoran silenciosamente.

  // Sprint 2.5b/E: `emojiDensity` (slider 0-3) eliminado y reemplazado por la
  // sección Emoticonos completa (toggle + frecuencia + máximo + whitelist
  // personalizable). Datos legacy con `emojiDensity` se ignoran silenciosamente.
  /** Sprint 2.5b/E — Si false, el setter NO usa NINGÚN emoji. Default true. */
  emojisEnabled: boolean;
  /** Sprint 2.5b/E — Cada cuántos mensajes el setter usa un emoji (1=cada msg, 2=cada 2, 3=cada 3). Default 2. */
  emojiFrequencyPerMessages: 1 | 2 | 3;
  /** Sprint 2.5b/E — Tope máximo de emojis por conversación entera (1-8). Default 5. */
  emojiMaxPerConversation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Sprint 2.5b/E — Whitelist personalizada de emojis con descripción de cuándo usar cada uno (max 8). Vacío = el setter usa su criterio (los del Coach). */
  customEmojis: EmojiCustomization[];

  /** Sprint 2.5b/C — Si true, el trainer ajusta preguntas extra; si false (default), el Coach lo gestiona. */
  qualificationQuestionsEnabled: boolean;
  /** Preguntas adicionales antes de proponer la llamada (0-2). Solo aplica si qualificationQuestionsEnabled=true. */
  extraQuestionsBeforeCall: 0 | 1 | 2;
  // Hito 12.1 (2026-05-20): `messageLengthDensity` y `toneRegister` (Sprint 2.5b/B)
  // ELIMINADOS del schema — Iván gestiona longitud y tono directamente desde
  // `core_v5_base` y `coach_v5`. Datos legacy en JSONB se ignoran silenciosamente
  // (parser ya no los lee). Migration 067 limpia las claves de tenants existentes.

  // ----- Hito 12.1: cumplimiento estricto (max msgs + addressing + forbidden) -----
  /** Hito 12.1 — Máximo de mensajes consecutivos por turno del setter (1-4). Default 4 (baseline = comportamiento previo). Enforce en 3 puntos: Generator instrucción, message_raw maxLength, Splitter maxParts. */
  aiMessagesPerTurnMax: 1 | 2 | 3 | 4;
  /** Hito 12.1 — Tratamiento que el setter usa al dirigirse al lead. 'mirror_lead' (default) detecta el uso del lead y propaga turno a turno desde el motor. Enforce con instrucción + validador V18 heurístico para tu/usted. */
  addressingMode: 'tu' | 'usted' | 'mirror_lead';
  /** Hito 12.1 — Palabras/frases que el setter NUNCA dirá al lead (0-10, cada una 1-40 chars, lowercase, dedupe). Enforce con instrucción + validador V17 post-LLM + 1 retry, luego degradación grácil. */
  forbiddenPhrases: string[];

  // ----- Hito 12.2: uso del nombre del lead (best effort) -----
  /**
   * Hito 12.2 — Modo de uso del nombre real del lead detectado en F0:
   *   - 'auto' (default): el setter solo usa el nombre si la detección lo
   *     marca usable (heurística + Haiku fallback en F0).
   *   - 'always': el setter usa el nombre aunque la detección diga "no
   *     usable" (riesgo: handles tipo "andrea12345" se usan literalmente).
   *   - 'never': el setter nunca menciona el nombre al lead.
   * Enforce best-effort vía instrucción markdown — el modelo respeta la
   * directiva en ~95% de los casos; no hay validador post-LLM en MVP.
   */
  useLeadNameMode: UseLeadNameMode;
  /**
   * Hito 12.2 — Tope de menciones del nombre del lead en toda la conversación
   * (0-5). 0 equivale a 'never'. Aplica solo si useLeadNameMode != 'never'.
   * Default 2 = 1 mención al saludar + 1 mención en momento clave (cierre).
   * Enforce best-effort vía instrucción markdown en MVP; futuro V19 validador
   * hará count estricto en Fase D.
   */
  leadNameMaxMentions: LeadNameMaxMentions;

  // ----- Hito 12.2: filtro público objetivo + verificación género (best effort) -----
  /**
   * Hito 12.2 — Género del público objetivo del trainer:
   *   - 'mixed' (default): sin filtro, feature off de facto.
   *   - 'male': el trainer trabaja solo con hombres.
   *   - 'female': el trainer trabaja solo con mujeres.
   * Si el lead detectado en F0 sugiere el género opuesto al target, el setter
   * introduce una pregunta de verificación en F1 (no F0) para confirmar si es
   * para sí mismo o para un tercero. NO descarta — solo pregunta.
   */
  targetClientGender: TargetClientGender;
  /**
   * Hito 12.2 — Estilo de la pregunta de verificación cuando hay mismatch de
   * género entre lead y target:
   *   - 'soft' (default): pregunta integrada al flujo natural ("por curiosidad,
   *     ¿es para ti o para alguien cercano?").
   *   - 'direct': pregunta explícita mencionando el filtro del trainer
   *     ("Trabajo solo con [hombres/mujeres], ¿es para ti o para un familiar?").
   * Aplica solo si targetClientGender != 'mixed'.
   */
  genderVerificationStyle: GenderVerificationStyle;

  // ----- Sprint Gamma 2.1: datos de contacto -----
  /** Nombre que la IA usará al referirse al trainer en handoff. null = "el equipo". */
  trainerName: string | null;
  /** Email del trainer para alertas (Resend). null = sin notificaciones. */
  trainerEmail: string | null;
  /** Teléfono E.164 (+34...) que la IA puede entregar al lead en handoff. null = no entregar. */
  trainerPhone: string | null;

  // ----- Sprint Gamma 2.5: notificaciones email -----
  /** Eventos del motor a los que el trainer está suscrito. Vacío = no recibe nada. */
  notificationSubscriptions: NotificationEventType[];

  // ----- Sprint Gamma 2.6b: Comportamiento en handoff (Causa B) -----
  /**
   * Si false (default), el setter usa el comportamiento legacy (Sprint 2.6 v2):
   * comparte trainerPhone si está configurado, sino frase genérica. NO se inyecta
   * directiva personalizada al prompt — el placeholder `{{handoff_directive}}`
   * en handoff_v4 v3 cae al render legacy.
   *
   * Si true, se aplica `handoffMode` + sub-config según modo elegido. El composer
   * construye el TrainerContext.handoff con `enabled=true` y reendea la directiva
   * concreta en handoff_v4.
   */
  handoffPersonalizationEnabled: boolean;
  /** Modo de cierre cuando se hace handoff. Solo aplica si `handoffPersonalizationEnabled=true`. */
  handoffMode: HandoffMode;
  /** Plantilla de mensaje propio cuando `handoffMode='custom_message'`. */
  handoffCustomTemplate: HandoffCustomTemplate;
  /** Texto libre cuando `handoffCustomTemplate='free'` (max 250 chars, sanitizado). */
  handoffCustomMessage: string | null;

  // ----- Sprint Gamma 2.5b/B + 2.5b/C: cualificación + propuesta llamada -----
  /**
   * Sprint 2.5b/C — modo de cierre de la cualificación:
   *   - 'calendar' (default): el setter envía URL de calendario (cal.com, calendly).
   *   - 'form': el setter envía URL de formulario (typeform, google form, etc.) en vez de proponer llamada.
   *   - 'human_handoff': el setter NO propone llamada NI envía link; deriva al humano (handoff).
   */
  callProposalMode: 'calendar' | 'form' | 'human_handoff';
  /**
   * URL HTTPS del recurso de cierre — calendario (modo 'calendar') o formulario (modo 'form').
   * null = el setter no comparte URL (acepta para 'calendar' como degradación; obligatorio en 'form'
   * para que tenga sentido). Ignorado si modo='human_handoff'.
   */
  closingResourceUrl: string | null;
  /** Frase opcional (max 200 chars) que el setter dirá justo antes de compartir el enlace de cierre. null = el setter decide. Ignorada si modo='human_handoff'. */
  calendarClosingMessage: string | null;

  // ----- Hito 11: Modo de agendado + timezone del trainer -----
  /**
   * Hito 11 — Modo de agendado: 'direct' = IA crea cita en GHL directamente
   * en el chat (Modo A). 'link' = IA envía el enlace del widget GHL (Modo B).
   * null = no elegido aún (UI muestra badge "Pendiente"; el motor cae a 'link'
   * como fallback conservador a menos que el legacy useApiBooking esté true).
   *
   * NO se serializa al markdown del trainer_prefs_v1 — es control de motor.
   */
  schedulingMode: 'direct' | 'link' | null;
  /**
   * Hito 11 — Zona horaria IANA del trainer (ej "Europe/Madrid"). El motor la
   * pasa a GHL getFreeSlots para calcular disponibilidad en su zona. null =
   * motor usa 'Europe/Madrid' como default conservador.
   *
   * NO se serializa al markdown del trainer_prefs_v1.
   */
  trainerTimezone: string | null;
}

export const CALL_PROPOSAL_MODES = ['calendar', 'form', 'human_handoff'] as const;
export type CallProposalMode = (typeof CALL_PROPOSAL_MODES)[number];

// ----- Sprint Gamma 2.6b: Comportamiento en handoff (Causa B) -----

export const HANDOFF_MODES = ['share_phone', 'silent', 'custom_message'] as const;
export type HandoffMode = (typeof HANDOFF_MODES)[number];

export const HANDOFF_CUSTOM_TEMPLATES = ['warm', 'professional', 'free'] as const;
export type HandoffCustomTemplate = (typeof HANDOFF_CUSTOM_TEMPLATES)[number];

export const HANDOFF_MODE_LABELS: Record<HandoffMode, { label: string; desc: string }> = {
  share_phone: {
    label: 'Compartir mi teléfono',
    desc: 'El setter da tu número al lead para que te escriba directamente. Requiere que tengas el teléfono configurado en Datos de contacto.',
  },
  silent: {
    label: 'Cerrar bot sin compartir',
    desc: 'El setter cierra la conversación sin entregar canal alguno. Tú recibirás email (si tienes el evento Handoff suscrito en Notificaciones) y atenderás manualmente.',
  },
  custom_message: {
    label: 'Mensaje propio',
    desc: 'Elige una plantilla preset (cálido o profesional) o escribe tu propio mensaje libre. El setter dirá esa frase al lead.',
  },
};

export const HANDOFF_CUSTOM_TEMPLATE_LABELS: Record<HandoffCustomTemplate, { label: string; desc: string; preview?: string }> = {
  warm: {
    label: 'Cierre cálido',
    desc: 'Tono cercano y agradecido — apto para nichos consultivos / coaching / bienestar.',
    preview:
      'Te paso con mi equipo personalmente — alguien te escribirá en cuanto pueda 🙏 gracias por tu paciencia.',
  },
  professional: {
    label: 'Cierre profesional',
    desc: 'Tono profesional y directo — apto para B2B, jurídico, premium, corporate.',
    preview:
      'Cierro la conversación aquí. Mi equipo recibirá tu mensaje y te responderá lo antes posible.',
  },
  free: {
    label: 'Personalizar',
    desc: 'Escribe tu propia frase (máximo 250 caracteres). El setter dirá exactamente esa frase al lead.',
  },
};

export const CALL_PROPOSAL_MODE_LABELS: Record<CallProposalMode, { label: string; desc: string }> = {
  calendar: { label: 'Calendario', desc: 'El setter cierra proponiendo llamada con tu calendario (cal.com, calendly).' },
  form: { label: 'Formulario', desc: 'El setter envía un formulario (typeform, google form) en vez de proponer llamada.' },
  human_handoff: { label: 'Derivar a humano', desc: 'El setter pausa la IA y te deriva el lead — tú lo atiendes personalmente, sin link automático.' },
};

/**
 * Eventos que el motor puede notificar por email al trainer. Espejo del set
 * que `apps/motor-agente/src/lib/email-templates.ts` sabe renderizar. Si añades
 * uno nuevo aquí, añade también la plantilla en el motor.
 */
// Sprint Gamma 2.5b/A: `error_motor` removido del set público — los errores
// técnicos van a un canal admin separado (no al trainer). Sprint posterior
// definirá ese canal (email Iván directo / Slack webhook / tabla admin_alerts).
export const NOTIFICATION_EVENT_TYPES = [
  'handoff',
  'qualified',
  'appointment_booked',
  'descalified',
  'paused_by_rule',
  'integration_down',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, { label: string; desc: string }> = {
  handoff: { label: 'Handoff a humano', desc: 'La IA te pasa la conversación porque el lead lo pidió o se queda fuera del flujo automatizado.' },
  qualified: { label: 'Lead cualificado', desc: 'La IA marca el lead como cualificado tras pasar el filtro del Cerebro.' },
  appointment_booked: { label: 'Cita agendada', desc: 'El lead reservó la llamada/sesión por el flujo automatizado.' },
  descalified: { label: 'Lead descalificado', desc: 'La IA descarta el lead (no encaja con tu criterio de cliente ideal).' },
  paused_by_rule: { label: 'IA pausada por regla', desc: 'Se pausó la IA en una conversación por una regla configurada (cuando esté disponible).' },
  integration_down: { label: 'Integración caída', desc: 'Un conector (GHL/YCloud/ManyChat) lleva horas sin recibir webhooks. Revisa la automation en el proveedor.' },
};

// ----- Hito 12.1: cumplimiento estricto -----

export const ADDRESSING_MODES = ['tu', 'usted', 'mirror_lead'] as const;
export type AddressingMode = (typeof ADDRESSING_MODES)[number];

export const ADDRESSING_MODE_LABELS: Record<AddressingMode, { label: string; desc: string }> = {
  mirror_lead: {
    label: 'Espejo del lead',
    desc: 'El setter detecta cómo se dirige el lead (tú o usted) y le devuelve en el mismo registro. Recomendado para la mayoría de nichos hispanos — el lead no nota artificialidad.',
  },
  tu: {
    label: 'Tutear siempre',
    desc: 'El setter usa "tú" sin importar cómo escriba el lead. Para marcas casual, fitness, coaching joven, comunidades donde la cercanía es la norma.',
  },
  usted: {
    label: 'Tratar de usted',
    desc: 'El setter usa "usted" siempre. Para nichos formales: jurídico, B2B premium, medicina, sectores tradicionales o cuando tu cliente tipo es de generación mayor.',
  },
};

export const AI_MESSAGES_PER_TURN_MAX_VALUES = [1, 2, 3, 4] as const;
export type AiMessagesPerTurnMax = (typeof AI_MESSAGES_PER_TURN_MAX_VALUES)[number];

export const AI_MESSAGES_PER_TURN_MAX_LABELS: Record<AiMessagesPerTurnMax, { label: string; hint: string; warning?: string }> = {
  1: {
    label: '1 mensaje',
    hint: 'Ultra-conciso: máx 1-2 oraciones (~280 chars). El setter siempre responde en una sola burbuja.',
    warning: 'Solo 1 mensaje por turno hace que el setter se perciba más robótico. Recomendado solo para nichos muy formales o cuando explícitamente quieres respuestas cortas.',
  },
  2: {
    label: 'Hasta 2 mensajes',
    hint: 'Respuesta corta-media. Total ~560 chars repartidos entre 1 o 2 burbujas según el momento.',
  },
  3: {
    label: 'Hasta 3 mensajes',
    hint: 'Respuesta moderada. Total ~840 chars. El setter usa 1, 2 o 3 según contexto.',
  },
  4: {
    label: 'Hasta 4 mensajes',
    hint: 'Default (baseline). Total ~1150 chars. Comportamiento previo a esta opción: el setter usa el número que pida el momento, hasta 4.',
  },
};

export const MAX_FORBIDDEN_PHRASES = 10;
export const MAX_FORBIDDEN_PHRASE_CHARS = 40;

// ----- Hito 12.2: uso del nombre del lead (best effort) -----

export const USE_LEAD_NAME_MODES = ['auto', 'always', 'never'] as const;
export type UseLeadNameMode = (typeof USE_LEAD_NAME_MODES)[number];

export const USE_LEAD_NAME_MODE_LABELS: Record<UseLeadNameMode, { label: string; desc: string }> = {
  auto: {
    label: 'Automático (recomendado)',
    desc: 'El setter usa el nombre del lead SOLO si lo detectamos como nombre humano legible (ej: "Andrea" sí, "andrea12345" no). Si la cuenta del lead no aporta un nombre real, el setter se dirige al lead sin mencionarlo.',
  },
  always: {
    label: 'Siempre',
    desc: 'El setter usa el nombre del lead aunque parezca un handle de usuario (ej: "andrea12345"). Usa esta opción solo si tus leads suelen tener nombres reales en GHL aunque sus usernames sean handles.',
  },
  never: {
    label: 'Nunca',
    desc: 'El setter no menciona el nombre del lead en ningún momento de la conversación. Útil si prefieres un trato más neutro o si tu nicho no encaja con personalización por nombre.',
  },
};

export const LEAD_NAME_MAX_MENTIONS_VALUES = [0, 1, 2, 3, 4, 5] as const;
export type LeadNameMaxMentions = (typeof LEAD_NAME_MAX_MENTIONS_VALUES)[number];

export const LEAD_NAME_MAX_MENTIONS_LABELS: Record<LeadNameMaxMentions, { label: string; hint: string }> = {
  0: { label: '0', hint: 'Sin menciones (equivale a "Nunca"). El setter no usa el nombre.' },
  1: { label: '1', hint: 'Una sola mención — típicamente en el saludo. Muy sutil.' },
  2: { label: '2', hint: 'Default. Saludo + un momento clave (cierre / propuesta de llamada). Personalización equilibrada.' },
  3: { label: '3', hint: 'Saludo + 2 momentos clave. Más cercano sin sobrecargar.' },
  4: { label: '4', hint: 'Uso frecuente. Útil en nichos donde la cercanía es valorada (coaching, comunidad).' },
  5: { label: '5', hint: 'Máximo. El setter usa el nombre prácticamente cada turno relevante. Puede percibirse forzado si la conversación es corta.' },
};

// ----- Hito 12.2: filtro público objetivo + verificación género (best effort) -----

export const TARGET_CLIENT_GENDERS = ['mixed', 'male', 'female'] as const;
export type TargetClientGender = (typeof TARGET_CLIENT_GENDERS)[number];

export const TARGET_CLIENT_GENDER_LABELS: Record<TargetClientGender, { label: string; desc: string }> = {
  mixed: {
    label: 'Mixto (sin filtro)',
    desc: 'Trabajas con cualquier género. El setter no aplica ningún filtro — atiende al lead que escriba sin preguntar por terceros.',
  },
  male: {
    label: 'Hombres',
    desc: 'Trabajas SOLO con hombres. Si detectamos que el lead que escribe parece ser mujer (por nombre, perfil), el setter introduce una pregunta de verificación: "¿es para ti o para algún familiar/cercano?". Útil para descartar leads que escriben por su pareja, hermano, etc.',
  },
  female: {
    label: 'Mujeres',
    desc: 'Trabajas SOLO con mujeres. Si detectamos que el lead que escribe parece ser hombre, el setter introduce una pregunta de verificación. NO descarta el lead — solo confirma para que no pierdas tiempo si es para un tercero opuesto al target.',
  },
};

export const GENDER_VERIFICATION_STYLES = ['soft', 'direct'] as const;
export type GenderVerificationStyle = (typeof GENDER_VERIFICATION_STYLES)[number];

export const GENDER_VERIFICATION_STYLE_LABELS: Record<GenderVerificationStyle, { label: string; desc: string }> = {
  soft: {
    label: 'Suave (recomendado)',
    desc: 'La pregunta se integra naturalmente en el flujo en F1: "por curiosidad, ¿es para ti o para alguien cercano?". No menciona explícitamente que filtras por género — solo abre la conversación.',
  },
  direct: {
    label: 'Directa',
    desc: 'La pregunta menciona explícitamente tu público objetivo: "Trabajo solo con hombres / mujeres, ¿es para ti o para un familiar?". Más eficiente para descartar pronto pero menos amable. Útil si tu volumen es alto y prefieres filtrar rápido.',
  },
};

const DEFAULT_SUBSCRIPTIONS: NotificationEventType[] = ['handoff', 'appointment_booked', 'integration_down'];

export const DEFAULT_TRAINER_PREFERENCES: TrainerPreferences = {
  emojisEnabled: true,
  emojiFrequencyPerMessages: 2,
  emojiMaxPerConversation: 5,
  customEmojis: [],
  qualificationQuestionsEnabled: false,
  extraQuestionsBeforeCall: 0,
  trainerName: null,
  trainerEmail: null,
  trainerPhone: null,
  notificationSubscriptions: [...DEFAULT_SUBSCRIPTIONS],
  callProposalMode: 'calendar',
  closingResourceUrl: null,
  calendarClosingMessage: null,
  // Sprint 2.6b: defaults preservan comportamiento legacy (toggle off = compat 100%)
  handoffPersonalizationEnabled: false,
  handoffMode: 'share_phone',
  handoffCustomTemplate: 'warm',
  handoffCustomMessage: null,
  // Hito 11: null = no elegido aún. UI muestra badge "Pendiente".
  schedulingMode: null,
  trainerTimezone: null,
  // Hito 12.1: cumplimiento estricto (max msgs + addressing + forbidden).
  // Defaults preservan comportamiento previo a Hito 12.1:
  //   - aiMessagesPerTurnMax: 4 = baseline (mismo cap hardcoded del splitter pre-Hito 12.1).
  //   - addressingMode: 'mirror_lead' = el setter espeja al lead, sin forzar registro.
  //   - forbiddenPhrases: [] = no hay vocabulario prohibido, el setter usa criterio normal.
  aiMessagesPerTurnMax: 4,
  addressingMode: 'mirror_lead',
  forbiddenPhrases: [],
  // Hito 12.2: uso del nombre del lead — defaults sanos para no romper tenants legacy.
  //   - useLeadNameMode 'auto' = el setter solo usa el nombre si la detección lo marca usable.
  //   - leadNameMaxMentions 2 = saludo + un momento clave (cierre típicamente).
  useLeadNameMode: 'auto',
  leadNameMaxMentions: 2,
  // Hito 12.2: filtro genero — defaults = feature off de facto.
  //   - targetClientGender 'mixed' = sin filtro; el setter no pregunta por terceros.
  //   - genderVerificationStyle 'soft' = si en futuro se activa el filtro, pregunta natural.
  targetClientGender: 'mixed',
  genderVerificationStyle: 'soft',
};

const MAX_HANDOFF_CUSTOM_MESSAGE_CHARS = 250;

/**
 * Sprint 2.6b — Sanitiza el mensaje libre de handoff (`handoffCustomMessage`).
 * - trim
 * - max 250 chars
 * - escape de tags reservados (igual estrategia que customInstructions / closingMessage).
 */
function sanitizeHandoffCustomMessage(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_HANDOFF_CUSTOM_MESSAGE_CHARS) {
    trimmed = trimmed.slice(0, MAX_HANDOFF_CUSTOM_MESSAGE_CHARS);
  }
  trimmed = trimmed.replace(
    /<\/(system|message|user|assistant|core_v4_base|core_v5_base|output_contract_v5|coach_v3|coach_v5|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi,
    '&lt;/$1&gt;',
  );
  return trimmed;
}

function parseHandoffMode(raw: unknown): HandoffMode {
  if (typeof raw === 'string' && (HANDOFF_MODES as readonly string[]).includes(raw)) {
    return raw as HandoffMode;
  }
  return 'share_phone';
}

function parseHandoffCustomTemplate(raw: unknown): HandoffCustomTemplate {
  if (typeof raw === 'string' && (HANDOFF_CUSTOM_TEMPLATES as readonly string[]).includes(raw)) {
    return raw as HandoffCustomTemplate;
  }
  return 'warm';
}

// ----- Hito 12.1 — parsers + sanitizers -----

function parseAiMessagesPerTurnMax(raw: unknown): 1 | 2 | 3 | 4 {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 4) {
    return raw as 1 | 2 | 3 | 4;
  }
  return 4;
}

function parseAddressingMode(raw: unknown): AddressingMode {
  if (typeof raw === 'string' && (ADDRESSING_MODES as readonly string[]).includes(raw)) {
    return raw as AddressingMode;
  }
  return 'mirror_lead';
}

/**
 * Hito 12.1 — Sanitiza una frase prohibida individual:
 *   - trim
 *   - lowercase (matching es case-insensitive en V17, normalizamos al guardar)
 *   - max 40 chars
 *   - escape de tags reservados (defensa anti prompt-injection del trainer)
 *   - rechaza strings vacíos tras trim
 */
export function sanitizeForbiddenPhrase(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_FORBIDDEN_PHRASE_CHARS) {
    trimmed = trimmed.slice(0, MAX_FORBIDDEN_PHRASE_CHARS);
  }
  trimmed = trimmed.replace(
    /<\/(system|message|user|assistant|core_v4_base|core_v5_base|output_contract_v5|coach_v3|coach_v5|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi,
    '&lt;/$1&gt;',
  );
  return trimmed;
}

function parseForbiddenPhrases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_FORBIDDEN_PHRASES) break;
    const s = sanitizeForbiddenPhrase(item);
    if (s == null) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ----- Hito 12.2 — parsers nombre del lead + filtro genero -----

function parseUseLeadNameMode(raw: unknown): UseLeadNameMode {
  if (typeof raw === 'string' && (USE_LEAD_NAME_MODES as readonly string[]).includes(raw)) {
    return raw as UseLeadNameMode;
  }
  return 'auto';
}

function parseLeadNameMaxMentions(raw: unknown): LeadNameMaxMentions {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 5) {
    return raw as LeadNameMaxMentions;
  }
  return 2;
}

function parseTargetClientGender(raw: unknown): TargetClientGender {
  if (typeof raw === 'string' && (TARGET_CLIENT_GENDERS as readonly string[]).includes(raw)) {
    return raw as TargetClientGender;
  }
  return 'mixed';
}

function parseGenderVerificationStyle(raw: unknown): GenderVerificationStyle {
  if (typeof raw === 'string' && (GENDER_VERIFICATION_STYLES as readonly string[]).includes(raw)) {
    return raw as GenderVerificationStyle;
  }
  return 'soft';
}

const MAX_CLOSING_RESOURCE_URL_CHARS = 200;
const MAX_CALENDAR_CLOSING_CHARS = 200;

/**
 * Sprint 2.5b/E — Sanitiza un emoji individual:
 *   - trim
 *   - max 8 chars (cubre la mayoría de ZWJ sequences)
 *   - Rechaza si vacío, contiene chars de control, ASCII visible (a-z A-Z 0-9
 *     puntuación normal) — debe parecer un emoji real.
 *   - Acepta cualquier carácter Unicode no-control (incluye emojis + algunos
 *     símbolos como ★ ✓ que el trainer podría querer usar).
 */
function sanitizeEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > MAX_EMOJI_CHARS) return null;
  // Rechaza si contiene chars de control o solo ASCII visible "normal" (letras/dígitos)
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
  // Si es 100% ASCII alfanumérico/puntuación común, NO es un emoji
  if (/^[\x20-\x7e]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeEmojiWhenToUse(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_EMOJI_DESCRIPTION_CHARS) {
    trimmed = trimmed.slice(0, MAX_EMOJI_DESCRIPTION_CHARS);
  }
  // Escape de tags reservados (igual estrategia que custom_instructions + closingMessage)
  trimmed = trimmed.replace(
    /<\/(system|message|user|assistant|core_v4_base|core_v5_base|output_contract_v5|coach_v3|coach_v5|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi,
    '&lt;/$1&gt;',
  );
  return trimmed;
}

function parseCustomEmojis(raw: unknown): EmojiCustomization[] {
  if (!Array.isArray(raw)) return [];
  const out: EmojiCustomization[] = [];
  const seenEmojis = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_EMOJIS) break;
    if (item == null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const emoji = sanitizeEmoji(r.emoji);
    const whenToUse = sanitizeEmojiWhenToUse(r.whenToUse);
    if (emoji == null || whenToUse == null) continue;
    if (seenEmojis.has(emoji)) continue; // dedup
    seenEmojis.add(emoji);
    out.push({ emoji, whenToUse });
  }
  return out;
}

function parseCallProposalMode(raw: unknown): CallProposalMode {
  if (typeof raw === 'string' && (CALL_PROPOSAL_MODES as readonly string[]).includes(raw)) {
    return raw as CallProposalMode;
  }
  return 'calendar';
}

/**
 * Valida una URL de recurso de cierre (calendario o formulario):
 *   - Debe ser HTTPS (rechaza http://, javascript:, file://, etc).
 *   - Debe ser parseable con `new URL()`.
 *   - Max 200 chars total.
 * Devuelve la URL trimmed normalizada o null si inválida.
 */
function sanitizeClosingResourceUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_CLOSING_RESOURCE_URL_CHARS) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitiza la frase de cierre antes del calendario: trim, max 200 chars,
 * escape de tags reservados (igual estrategia que custom_instructions).
 */
function sanitizeCalendarClosingMessage(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_CALENDAR_CLOSING_CHARS) trimmed = trimmed.slice(0, MAX_CALENDAR_CLOSING_CHARS);
  trimmed = trimmed.replace(
    /<\/(system|message|user|assistant|core_v4_base|core_v5_base|output_contract_v5|coach_v3|coach_v5|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi,
    '&lt;/$1&gt;',
  );
  return trimmed;
}

function parseNotificationSubscriptions(raw: unknown): NotificationEventType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SUBSCRIPTIONS];
  const valid = new Set<NotificationEventType>();
  for (const item of raw) {
    if (typeof item === 'string' && (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(item)) {
      valid.add(item as NotificationEventType);
    }
  }
  return Array.from(valid);
}

/**
 * Sanitiza el contenido de una instrucción libre antes de persistirla a BD o
 * inyectarla al prompt. Trim, max 500 chars, escape de tags peligrosos
 * (defensa anti prompt-injection del trainer).
 */
export function sanitizeCustomInstruction(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 500) trimmed = trimmed.slice(0, 500);
  // Escape de cierres de tags reservados del Cerebro/Anthropic
  trimmed = trimmed.replace(
    /<\/(system|message|user|assistant|core_v4_base|core_v5_base|output_contract_v5|coach_v3|coach_v5|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi,
    '&lt;/$1&gt;',
  );
  return trimmed;
}

/**
 * Normaliza un teléfono a E.164 si es razonable, o null si no es parseable.
 * Acepta input con espacios, guiones, paréntesis. Ej: "+34 600 123 456" → "+34600123456".
 * Si el input no empieza con +, no lo intentamos adivinar (sería ambiguo) → null.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Strip spaces, dashes, parens
  const cleaned = trimmed.replace(/[\s\-()]/g, '');
  if (!PHONE_E164_REGEX.test(cleaned)) return null;
  return cleaned;
}

export function isValidEmail(value: string | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Sanea custom instructions: trim, max length, escape de fragmentos peligrosos
 * (cierres de tags XML que podrían romper el prompt compuesto).
 */
function sanitizeTrainerName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, MAX_TRAINER_NAME_CHARS);
}

/**
 * Parsea un JSON arbitrario (typically de `trainer_preferences.preferences` JSONB)
 * y devuelve un objeto válido. Valores ausentes o inválidos se reemplazan por
 * defaults — NUNCA tira.
 *
 * Esto garantiza que cualquier corrupción del JSONB no rompe la composición
 * del prompt en runtime.
 */
export function parseTrainerPreferences(raw: unknown): TrainerPreferences {
  const out: TrainerPreferences = { ...DEFAULT_TRAINER_PREFERENCES };
  if (raw == null || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;

  // Sprint 2.5b/A + 2.5b/E: claves obsoletas (`doubleQuestionMark`,
  // `preferVoiceNotesAcknowledgment`, `emojiDensity`) se ignoran silenciosamente —
  // pueden seguir en JSONB de tenants legacy pero no se usan.

  // Sprint 2.5b/E — sección Emoticonos
  if (typeof r.emojisEnabled === 'boolean') {
    out.emojisEnabled = r.emojisEnabled;
  }
  if (typeof r.emojiFrequencyPerMessages === 'number' && Number.isInteger(r.emojiFrequencyPerMessages)) {
    const n = r.emojiFrequencyPerMessages;
    if (n >= 1 && n <= 3) {
      out.emojiFrequencyPerMessages = n as 1 | 2 | 3;
    }
  }
  if (typeof r.emojiMaxPerConversation === 'number' && Number.isInteger(r.emojiMaxPerConversation)) {
    const n = r.emojiMaxPerConversation;
    if (n >= 1 && n <= 8) {
      out.emojiMaxPerConversation = n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    }
  }
  out.customEmojis = parseCustomEmojis(r.customEmojis);

  if (typeof r.extraQuestionsBeforeCall === 'number' && Number.isInteger(r.extraQuestionsBeforeCall)) {
    const n = r.extraQuestionsBeforeCall;
    if (n >= 0 && n <= 2) {
      out.extraQuestionsBeforeCall = n as 0 | 1 | 2;
    }
  }

  // Sprint Gamma 2.5b/C — toggle preguntas + selector cierre
  if (typeof r.qualificationQuestionsEnabled === 'boolean') {
    out.qualificationQuestionsEnabled = r.qualificationQuestionsEnabled;
  }
  out.callProposalMode = parseCallProposalMode(r.callProposalMode);

  // Hito 12.1 (2026-05-20): `messageLengthDensity` y `toneRegister` ELIMINADOS
  // del parser. Datos legacy en JSONB se ignoran silenciosamente (Iván gestiona
  // longitud y tono desde core_v5_base + coach_v5).

  // Sprint Gamma 2.6b — Comportamiento en handoff
  if (typeof r.handoffPersonalizationEnabled === 'boolean') {
    out.handoffPersonalizationEnabled = r.handoffPersonalizationEnabled;
  }
  out.handoffMode = parseHandoffMode(r.handoffMode);
  out.handoffCustomTemplate = parseHandoffCustomTemplate(r.handoffCustomTemplate);
  out.handoffCustomMessage = sanitizeHandoffCustomMessage(r.handoffCustomMessage);

  // Sprint Gamma 2.5b/B + 2.5b/C — campos cualificación.
  // Sprint 2.5b/C renombró calendarUrl → closingResourceUrl. Aceptamos ambos
  // para compatibilidad con BD legacy (calendarUrl tiene prioridad si presente
  // en JSONB legacy de tenants viejos sin migrar).
  const urlRaw = r.closingResourceUrl ?? r.calendarUrl;
  out.closingResourceUrl = sanitizeClosingResourceUrl(urlRaw);
  out.calendarClosingMessage = sanitizeCalendarClosingMessage(r.calendarClosingMessage);

  // Sprint Gamma 2.1
  out.trainerName = sanitizeTrainerName(r.trainerName as string | null | undefined);

  if (typeof r.trainerEmail === 'string' && isValidEmail(r.trainerEmail)) {
    out.trainerEmail = r.trainerEmail.trim().toLowerCase();
  }

  out.trainerPhone = normalizePhoneE164(r.trainerPhone as string | null | undefined);

  out.notificationSubscriptions = parseNotificationSubscriptions(r.notificationSubscriptions);

  // Hito 11 — Modo de agendado + timezone del trainer.
  if (r.schedulingMode === 'direct' || r.schedulingMode === 'link') {
    out.schedulingMode = r.schedulingMode;
  }
  if (typeof r.trainerTimezone === 'string') {
    const tz = r.trainerTimezone.trim();
    out.trainerTimezone = tz === '' ? null : tz;
  }

  // Hito 12.1 — cumplimiento estricto (max msgs + addressing + forbidden).
  out.aiMessagesPerTurnMax = parseAiMessagesPerTurnMax(r.aiMessagesPerTurnMax);
  out.addressingMode = parseAddressingMode(r.addressingMode);
  out.forbiddenPhrases = parseForbiddenPhrases(r.forbiddenPhrases);

  // Hito 12.2 — uso del nombre del lead + filtro genero (best effort).
  out.useLeadNameMode = parseUseLeadNameMode(r.useLeadNameMode);
  out.leadNameMaxMentions = parseLeadNameMaxMentions(r.leadNameMaxMentions);
  out.targetClientGender = parseTargetClientGender(r.targetClientGender);
  out.genderVerificationStyle = parseGenderVerificationStyle(r.genderVerificationStyle);

  return out;
}

/**
 * Hito 11 — Listado curado de timezones IANA presentadas en el selector del
 * panel /settings/scheduling. Cubre el top hispanohablante + portugués/inglés
 * comunes. El motor acepta cualquier IANA válida en runtime (no se valida
 * contra esta lista), pero la UI solo expone estas.
 */
export const TRAINER_TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Europe/Madrid', label: 'España peninsular (Europe/Madrid)' },
  { value: 'Atlantic/Canary', label: 'Canarias (Atlantic/Canary)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Mexico_City', label: 'México (CDMX)' },
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { value: 'America/Asuncion', label: 'Paraguay (Asunción)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/La_Paz', label: 'Bolivia (La Paz)' },
  { value: 'America/Costa_Rica', label: 'Costa Rica' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/El_Salvador', label: 'El Salvador' },
  { value: 'America/Guatemala', label: 'Guatemala' },
  { value: 'America/Tegucigalpa', label: 'Honduras' },
  { value: 'America/Managua', label: 'Nicaragua' },
  { value: 'America/Havana', label: 'Cuba (La Habana)' },
  { value: 'America/Santo_Domingo', label: 'R. Dominicana' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { value: 'Europe/Lisbon', label: 'Portugal (Lisboa)' },
  { value: 'Europe/London', label: 'Reino Unido (Londres)' },
  { value: 'America/New_York', label: 'EE.UU. Este (Nueva York)' },
  { value: 'America/Los_Angeles', label: 'EE.UU. Pacífico (Los Ángeles)' },
];

/**
 * Hito 11 — Comprueba si una timezone IANA es válida y está soportada por
 * el runtime de Node (Intl.DateTimeFormat). Permite cualquier IANA aunque
 * no esté en TRAINER_TIMEZONE_OPTIONS — el panel valida con esta función.
 */
export function isValidIanaTimezone(tz: string | null | undefined): boolean {
  if (typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (trimmed === '') return false;
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// Hito 12.1 (2026-05-20): `MESSAGE_LENGTH_DESCRIPTIONS` y `TONE_DESCRIPTIONS`
// eliminados — la longitud y el tono se gestionan en core_v5_base y coach_v5,
// no como preferencias del trainer. El serializer ya no emite líneas para esos
// dos campos en la sección "### Estilo" del markdown.

/**
 * Hito 12.1 — descripciones inyectadas al `trainer_prefs_v1` para que el setter
 * conozca el techo de mensajes por turno. El motor enforcea adicionalmente
 * con maxLength dinámico en el Generator + maxParts dinámico en el Splitter.
 */
const AI_MESSAGES_PER_TURN_MAX_DESCRIPTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: 'responde en COMO MUCHO 1 mensaje consecutivo (1 sola burbuja). Sé ultra-conciso: 1-2 oraciones, ~280 caracteres totales. Si necesitas decir algo más amplio, prioriza lo esencial y deja el resto para cuando el lead responda. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
  2: 'responde en COMO MUCHO 2 mensajes consecutivos. Toda tu respuesta debe caber en ~560 caracteres totales. El número real puede ser 1 cuando una frase basta — el cap es el techo, no la meta. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
  3: 'responde en COMO MUCHO 3 mensajes consecutivos. Toda tu respuesta debe caber en ~840 caracteres totales. Usa 1, 2 o 3 según el momento — el cap es el techo, no la meta. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
  4: 'responde en COMO MUCHO 4 mensajes consecutivos. Toda tu respuesta debe caber en ~1150 caracteres totales. Usa el número que pida el momento — el cap es el techo, no la meta. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
};

/**
 * Hito 12.1 — descripciones inyectadas al `trainer_prefs_v1` cuando addressingMode
 * es 'tu' o 'usted'. Para 'mirror_lead' el motor inyecta una directiva dinámica
 * turno a turno (no estática), basada en el último mensaje del lead.
 */
const ADDRESSING_MODE_DESCRIPTIONS: Record<'tu' | 'usted', string> = {
  tu: 'trata SIEMPRE al lead de tú. Conjuga verbos en 2ª persona singular informal ("¿qué tal estás?", "te paso", "cuéntame", "tu objetivo"). NO uses "usted" ni conjugaciones formales aunque el lead las use — mantén siempre el tuteo. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
  usted: 'trata SIEMPRE al lead de usted. Conjuga verbos en 3ª persona singular formal ("¿cómo está usted?", "le paso", "cuénteme", "su objetivo"). NO uses "tú" ni conjugaciones informales aunque el lead tutee — mantén siempre el ustedeo. ESTA REGLA ES ESTRICTA: el sistema valida el output antes de enviar.',
};

/**
 * Convierte preferencias estructuradas + lista de instrucciones custom del
 * trainer en markdown que se inyecta al final del system prompt. Determinístico
 * y testeable.
 *
 * NO incluye: trainerEmail, trainerPhone, trainerName (esos viven en BD para
 * inyección dinámica via placeholder en handoff_v4, Sprint Gamma 2.6).
 *
 * @param prefs Preferencias estructuradas (toggles + datos contacto).
 * @param customInstructions Lista de instrucciones libres activas, ya sanitizadas
 *   y ordenadas por sort_order. Cada string es 1 instrucción del trainer (de la
 *   tabla trainer_custom_instructions). Si está vacío, no se emite la sección.
 */
export function serializeTrainerPreferences(
  prefs: TrainerPreferences,
  customInstructions: string[] = [],
): string {
  const lines: string[] = [];
  lines.push('## Preferencias del trainer (ajustes de superficie)');
  lines.push('');
  lines.push(
    'Estos son ajustes de **estilo** definidos por el trainer dueño de la sub-cuenta. ' +
      'Aplícalos como modificadores de superficie, NUNCA por encima de las reglas críticas ' +
      'del Cerebro ni de las directivas del Coach.',
  );
  lines.push('');

  lines.push('### Estilo');
  lines.push('');

  // Sprint 2.5b/A: directrices universalmente deseables — siempre activas.
  lines.push(
    '- **Doble interrogación**: cuando termines una frase con pregunta, usa `??` en lugar de `?` ' +
      '(p.ej. "¿qué tal??"). Aplica solo a preguntas explícitas, no a frases declarativas.',
  );
  // Hito 12.1 (2026-05-20): líneas de longitud y tono ELIMINADAS — Iván las
  // gestiona desde core_v5_base + coach_v5.
  // Hito 12.1 — Máximo de mensajes por turno (cumplimiento ESTRICTO: instrucción + Generator maxLength + Splitter maxParts).
  lines.push(`- **Máximo de mensajes por turno**: ${AI_MESSAGES_PER_TURN_MAX_DESCRIPTIONS[prefs.aiMessagesPerTurnMax]}`);
  // Hito 12.1 — Tratamiento. Solo emitir si tu/usted; mirror_lead se inyecta dinámicamente desde el motor turno a turno (basado en detectAddressing del último mensaje del lead).
  if (prefs.addressingMode === 'tu' || prefs.addressingMode === 'usted') {
    lines.push(`- **Tratamiento al lead**: ${ADDRESSING_MODE_DESCRIPTIONS[prefs.addressingMode]}`);
  }
  lines.push(
    '- **Acknowledge audios**: si el lead envía un audio, menciónalo explícitamente al inicio ' +
      'de tu respuesta (p.ej. "escuché tu audio…", "acabo de oír lo que mandas…").',
  );

  // Sprint 2.5b/E — Sección Emoticonos.
  lines.push('');
  lines.push('### Emoticonos');
  lines.push('');
  if (!prefs.emojisEnabled) {
    lines.push(
      '- **Sin emojis**: NO uses NINGÚN emoji en tus respuestas. Texto plano siempre. ' +
        'Esta directriz tiene prioridad sobre cualquier sugerencia del Coach o del Cerebro.',
    );
  } else {
    const freq = prefs.emojiFrequencyPerMessages;
    const freqText =
      freq === 1
        ? 'aproximadamente 1 emoji por mensaje (frecuencia alta)'
        : freq === 2
          ? 'aproximadamente 1 emoji cada 2 mensajes (frecuencia media)'
          : 'aproximadamente 1 emoji cada 3 mensajes (frecuencia baja)';
    lines.push(`- **Frecuencia**: ${freqText}.`);
    lines.push(
      `- **Tope por conversación**: usa como máximo ${prefs.emojiMaxPerConversation} emoji${prefs.emojiMaxPerConversation === 1 ? '' : 's'} en toda la conversación, ` +
        'aunque el lead la alargue. Si llegas al tope, sigue sin emojis hasta el cierre.',
    );
    if (prefs.customEmojis.length > 0) {
      lines.push(
        `- **Whitelist del trainer**: usa SOLO estos emojis (NO otros, NO inventes ni añadas variantes), ` +
          `cada uno cuando aplique el contexto descrito:`,
      );
      for (const e of prefs.customEmojis) {
        lines.push(`  - ${e.emoji} → ${e.whenToUse}`);
      }
    }
  }

  // Hito 12.2 — Personalización con el nombre del lead (best effort).
  // El motor en Fase B-C resolverá un placeholder con el nombre detectado;
  // por ahora el setter lee el nombre del historial/contexto del lead que ya
  // recibe y aplica la directiva con su criterio.
  lines.push('');
  lines.push('### Personalización con el nombre del lead');
  lines.push('');
  switch (prefs.useLeadNameMode) {
    case 'never':
      lines.push(
        '- **Sin uso del nombre**: NO menciones el nombre del lead en ningún momento de la conversación, ' +
          'aunque lo conozcas por GHL o por el propio mensaje del lead. Trato neutro siempre.',
      );
      break;
    case 'always':
      lines.push(
        '- **Uso del nombre flexible**: usa el nombre del lead que aparezca en sus datos de contacto ' +
          '(GHL/perfil de canal) aunque parezca un handle de usuario (ej: "andrea12345"). Solo evita ' +
          'usar el nombre si claramente NO hay nada parecido a un nombre humano.',
      );
      break;
    case 'auto':
    default:
      lines.push(
        '- **Uso del nombre con criterio**: si los datos del lead aportan un nombre humano legible ' +
          '(ej: "Andrea", "Andrea Martínez"), úsalo en momentos clave de la conversación. Si lo único ' +
          'que tienes es un handle no legible (ej: "andrea12345", "user2381", "🔥Andre🔥"), NO inventes ' +
          'un nombre — dirígete al lead de forma neutra sin mencionarlo.',
      );
      break;
  }
  if (prefs.useLeadNameMode !== 'never') {
    const maxN = prefs.leadNameMaxMentions;
    if (maxN === 0) {
      lines.push(
        '- **Tope de menciones**: 0 menciones. El trainer ha desactivado el uso del nombre con ' +
          'este tope — comportamiento equivalente a "Sin uso del nombre". No menciones el nombre del lead.',
      );
    } else {
      const word = maxN === 1 ? 'vez' : 'veces';
      const hint =
        maxN === 1
          ? 'típicamente solo en el saludo inicial.'
          : maxN === 2
            ? 'típicamente: saludo + un momento clave (cierre / propuesta de llamada).'
            : maxN === 3
              ? 'distribuye entre: saludo + 2 momentos clave de la conversación.'
              : maxN === 4
                ? 'reparte a lo largo de la conversación, pero no en cada turno consecutivo — espacia las menciones.'
                : 'puedes usarlo casi en cada turno relevante. NO uses el nombre dos turnos seguidos sin necesidad — espacia para que no se perciba forzado.';
      lines.push(
        `- **Tope de menciones del nombre**: usa el nombre del lead como máximo ${maxN} ${word} en toda la conversación. ${hint} ` +
          'No abuses — la personalización funciona por contraste con turnos donde NO usas el nombre.',
      );
    }
  }

  // Hito 12.2 — Filtro de público objetivo + verificación de género (best effort).
  // Solo se emite si el trainer activó el filtro. Modo 'mixed' (default) → no emite nada.
  if (prefs.targetClientGender !== 'mixed') {
    const targetLabel = prefs.targetClientGender === 'male' ? 'hombres' : 'mujeres';
    const oppositeLabel = prefs.targetClientGender === 'male' ? 'mujer' : 'hombre';
    lines.push('');
    lines.push('### Filtro de público objetivo');
    lines.push('');
    lines.push(
      `El trainer trabaja **SOLO con ${targetLabel}**. Si el lead que escribe parece ser ${oppositeLabel} ` +
        '(por su nombre, foto de perfil, lenguaje, o cualquier señal disponible en el contexto), debes ' +
        'introducir una pregunta de verificación en **Fase 1 (NO en Fase 0)** para confirmar si el lead ' +
        'es para sí mismo o para un tercero (pareja, familiar, amistad). NO descartes el lead — solo pregunta.',
    );
    lines.push('');
    if (prefs.genderVerificationStyle === 'direct') {
      lines.push(
        `- **Estilo directo**: menciona explícitamente al lead que el trainer trabaja solo con ` +
          `${targetLabel}. Ejemplo: "Mira, te cuento — el programa es solo para ${targetLabel}. ` +
          '¿Es para ti o estás escribiendo por algún familiar o pareja?". Más eficiente para filtrar pronto, ' +
          'menos amable.',
      );
    } else {
      lines.push(
        '- **Estilo suave**: integra la pregunta naturalmente sin mencionar que filtras por género. ' +
          'Ejemplo: "Por curiosidad antes de seguir, ¿estás escribiendo por ti misma/mismo o por algún ' +
          'familiar / pareja / cercano?". Más amable, mantiene la conversación abierta.',
      );
    }
    lines.push(
      `- **Si confirma que es para sí**: continúa el flujo normal — aunque parezca ${oppositeLabel}, el ` +
        'lead te dice que es para sí. Confía en lo que te diga y avanza.',
    );
    lines.push(
      `- **Si confirma que es para un tercero ${targetLabel === 'hombres' ? 'hombre' : 'mujer'}**: ` +
        'continúa cualificando al lead sobre la persona objetivo (no sobre quien escribe). Pregunta ' +
        'por ese tercero como cliente final.',
    );
    lines.push(
      `- **Si confirma que es para un tercero ${oppositeLabel}** (mismo género que quien escribe): ` +
        'descarta amablemente — explica que el programa no encaja con ese perfil. Marca handoff / ' +
        'descalificación según el flujo del Cerebro.',
    );
    lines.push(
      '- **Si NO detectas señales claras del género del lead**: no introduzcas esta pregunta — sigue ' +
        'el flujo normal. La pregunta solo es útil cuando hay mismatch evidente.',
    );
  }

  lines.push('');
  lines.push('### Cualificación y propuesta de llamada');
  lines.push('');

  // Sprint 2.5b/C — Solo emitir directriz "preguntas extra" si el trainer la activó.
  // Si está desactivado (default), el Coach gestiona este aspecto y el Cerebro
  // decide el flujo estándar — NO inyectamos nada para no contradecir al Coach.
  if (prefs.qualificationQuestionsEnabled) {
    if (prefs.extraQuestionsBeforeCall > 0) {
      const n = prefs.extraQuestionsBeforeCall;
      const word = n === 1 ? 'pregunta adicional' : 'preguntas adicionales';
      lines.push(
        `- **Más contexto antes de la llamada**: antes de proponer la llamada/cita, haz ${n} ` +
          `${word} para reforzar contexto del lead (no preguntas obvias ya respondidas; ` +
          'busca matiz: "¿desde cuándo te pasa?", "¿qué has probado antes?", etc.).',
      );
    } else {
      lines.push(
        '- **Cualificación estándar**: sigue el flujo de fases del Cerebro sin preguntas extra antes de la cita.',
      );
    }
  }

  // Sprint 2.5b/C — Cierre según modo elegido por el trainer.
  switch (prefs.callProposalMode) {
    case 'calendar':
      if (prefs.closingResourceUrl) {
        lines.push(
          `- **Cierre con calendario propio del trainer**: cuando llegue el momento de proponer ` +
            `la llamada/sesión, comparte EXACTAMENTE este enlace de calendario: ` +
            `\`${prefs.closingResourceUrl}\`. NO inventes otro, NO modifiques el dominio.`,
        );
      }
      break;
    case 'form':
      if (prefs.closingResourceUrl) {
        lines.push(
          `- **Cierre con formulario en lugar de llamada**: cuando hayas cualificado al lead, ` +
            `NO propongas llamada — comparte EXACTAMENTE este enlace de formulario: ` +
            `\`${prefs.closingResourceUrl}\`. El formulario es el siguiente paso del trainer.`,
        );
      }
      break;
    case 'human_handoff':
      lines.push(
        `- **Cierre con derivación a humano**: cuando hayas cualificado al lead, NO propongas ` +
          `llamada NI envíes ningún enlace. Marca \`conversation_status='handoff'\` y di una frase ` +
          `breve tipo "ahora te paso con el equipo personalmente". El motor pausará la IA tras tu turno ` +
          `y el trainer atenderá manualmente.`,
      );
      break;
  }
  // Frase de cierre solo aplica a modos que envían link.
  if (prefs.calendarClosingMessage && prefs.callProposalMode !== 'human_handoff') {
    lines.push(
      `- **Frase de cierre del trainer**: cuando vayas a compartir el enlace de cierre, ` +
        `di exactamente (o muy similar) esta frase: "${prefs.calendarClosingMessage}".`,
    );
  }

  // Hito 12.1 — Vocabulario prohibido (cumplimiento ESTRICTO vía validador V17).
  // Solo se emite la sección si el trainer configuró al menos una frase prohibida.
  if (prefs.forbiddenPhrases.length > 0) {
    lines.push('');
    lines.push('### Vocabulario prohibido');
    lines.push('');
    lines.push(
      'El trainer ha indicado que las siguientes palabras o frases NUNCA deben aparecer en tus ' +
        'mensajes al lead. Antes de enviar, revisa tu respuesta: si alguna de estas palabras aparece, ' +
        'REESCRIBE usando un sinónimo o reformula la frase para evitarla. **ESTA REGLA ES ESTRICTA**: ' +
        'el sistema valida el output antes de enviar y te obligará a reescribir si la incumples.',
    );
    lines.push('');
    for (const phrase of prefs.forbiddenPhrases) {
      lines.push(`- "${phrase}"`);
    }
  }

  // Sprint Gamma 2.3 — Instrucciones libres del trainer (lista, una por bullet)
  const activeInstructions = customInstructions.filter((s) => s.trim().length > 0);
  if (activeInstructions.length > 0) {
    lines.push('');
    lines.push('### Instrucciones específicas del trainer');
    lines.push('');
    lines.push(
      'El trainer dueño de esta sub-cuenta ha indicado las siguientes **instrucciones específicas** ' +
        'que debes respetar siempre que no contradigan reglas críticas del Cerebro ni directivas del ' +
        'Coach. Si hay conflicto entre estas instrucciones y el Cerebro/Coach, prevalece el Cerebro/Coach.',
    );
    lines.push('');
    for (const inst of activeInstructions) {
      lines.push(`- ${inst}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
