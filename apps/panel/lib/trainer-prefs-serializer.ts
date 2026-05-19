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
  /** Sprint 2.5b/B — Longitud de mensajes: 0=cortos, 1=equilibrado (default), 2=amplios. */
  messageLengthDensity: 0 | 1 | 2;
  /** Sprint 2.5b/B — Registro tonal: 0=cercano-coloquial, 1=equilibrado (default), 2=profesional. */
  toneRegister: 0 | 1 | 2;

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

const DEFAULT_SUBSCRIPTIONS: NotificationEventType[] = ['handoff', 'appointment_booked', 'integration_down'];

export const DEFAULT_TRAINER_PREFERENCES: TrainerPreferences = {
  emojisEnabled: true,
  emojiFrequencyPerMessages: 2,
  emojiMaxPerConversation: 5,
  customEmojis: [],
  qualificationQuestionsEnabled: false,
  extraQuestionsBeforeCall: 0,
  messageLengthDensity: 1,
  toneRegister: 1,
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

  // Sprint Gamma 2.5b/B — sliders nuevos
  if (typeof r.messageLengthDensity === 'number' && Number.isInteger(r.messageLengthDensity)) {
    const n = r.messageLengthDensity;
    if (n >= 0 && n <= 2) {
      out.messageLengthDensity = n as 0 | 1 | 2;
    }
  }
  if (typeof r.toneRegister === 'number' && Number.isInteger(r.toneRegister)) {
    const n = r.toneRegister;
    if (n >= 0 && n <= 2) {
      out.toneRegister = n as 0 | 1 | 2;
    }
  }

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

const MESSAGE_LENGTH_DESCRIPTIONS = {
  0: 'mensajes cortos y directos (1 frase por turno, máximo 2 si necesitas contexto). Evita párrafos.',
  1: 'longitud equilibrada (1-2 frases por mensaje; si necesitas más contexto, parte en 2 mensajes consecutivos).',
  2: 'mensajes algo más amplios cuando hace falta contexto (2-3 frases en un mismo mensaje, evitando parecer escueto).',
} as const;

const TONE_DESCRIPTIONS = {
  0: 'cercano y coloquial, como un amigo del sector. Tutea, usa expresiones cotidianas. Sin exagerar (no insultos ni chistes).',
  1: 'profesional pero cercano. Tutea por defecto. Evita jerga excesiva.',
  2: 'profesional y elegante. Evita coloquialismos. Considera el usted si el lead lo usa primero.',
} as const;

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
  lines.push(`- **Longitud de mensajes**: ${MESSAGE_LENGTH_DESCRIPTIONS[prefs.messageLengthDensity]}`);
  lines.push(`- **Tono**: ${TONE_DESCRIPTIONS[prefs.toneRegister]}`);
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
