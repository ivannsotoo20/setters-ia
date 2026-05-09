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
 * Sprint Gamma 2.1 + 2.2 (NUEVOS campos):
 *   - trainerEmail / trainerPhone / trainerName: datos de contacto. NO se
 *     serializan al markdown del prompt — viven en BD para inyección dinámica
 *     via placeholder en handoff_v4 (Sprint Gamma 2.6).
 *   - customInstructions: textarea libre. SÍ se serializa al markdown como
 *     sección "Instrucciones específicas del trainer".
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Phone E.164: + obligatorio + 8-15 dígitos. Acepta espacios/guiones en input,
// pero el normalizer los strippea.
const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

const MAX_CUSTOM_INSTRUCTIONS_CHARS = 4000;
const MAX_TRAINER_NAME_CHARS = 100;

export interface TrainerPreferences {
  // ----- Sprint Gamma 1: estilo (existentes) -----
  /** Termina las preguntas con `??` en lugar de `?`. */
  doubleQuestionMark: boolean;
  /** Densidad de emojis: 0=casi sin emojis, 1=algunos, 2=moderada (default), 3=abundante. */
  emojiDensity: 0 | 1 | 2 | 3;
  /** Preguntas adicionales antes de proponer la llamada (0-2). */
  extraQuestionsBeforeCall: 0 | 1 | 2;
  /** Si lead manda audio, mencionarlo explícitamente en la respuesta. */
  preferVoiceNotesAcknowledgment: boolean;

  // ----- Sprint Gamma 2.1: datos de contacto -----
  /** Nombre que la IA usará al referirse al trainer en handoff. null = "el equipo". */
  trainerName: string | null;
  /** Email del trainer para alertas (Resend). null = sin notificaciones. */
  trainerEmail: string | null;
  /** Teléfono E.164 (+34...) que la IA puede entregar al lead en handoff. null = no entregar. */
  trainerPhone: string | null;

  // ----- Sprint Gamma 2.2: instrucciones libres -----
  /** Texto libre del trainer (max 4000 chars). Se inyecta al prompt como sección. */
  customInstructions: string | null;
}

export const DEFAULT_TRAINER_PREFERENCES: TrainerPreferences = {
  doubleQuestionMark: false,
  emojiDensity: 2,
  extraQuestionsBeforeCall: 0,
  preferVoiceNotesAcknowledgment: false,
  trainerName: null,
  trainerEmail: null,
  trainerPhone: null,
  customInstructions: null,
};

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
function sanitizeCustomInstructions(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_CUSTOM_INSTRUCTIONS_CHARS) {
    trimmed = trimmed.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS);
  }
  // Escape de tags peligrosos del Cerebro/Anthropic (no permite cerrar prematuramente).
  // Reemplazamos < > de cierres tipo </system>, </message>, </core_v4_base> con
  // entidades para que el modelo lo vea como texto, no como tag.
  trimmed = trimmed.replace(/<\/(system|message|user|assistant|core_v4_base|coach_v3|admin_overrides_v1|trainer_prefs_v1|critical_rules|role|safety_first)>/gi, '&lt;/$1&gt;');
  return trimmed;
}

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

  if (typeof r.doubleQuestionMark === 'boolean') {
    out.doubleQuestionMark = r.doubleQuestionMark;
  }

  if (typeof r.emojiDensity === 'number' && Number.isInteger(r.emojiDensity)) {
    const n = r.emojiDensity;
    if (n >= 0 && n <= 3) {
      out.emojiDensity = n as 0 | 1 | 2 | 3;
    }
  }

  if (typeof r.extraQuestionsBeforeCall === 'number' && Number.isInteger(r.extraQuestionsBeforeCall)) {
    const n = r.extraQuestionsBeforeCall;
    if (n >= 0 && n <= 2) {
      out.extraQuestionsBeforeCall = n as 0 | 1 | 2;
    }
  }

  if (typeof r.preferVoiceNotesAcknowledgment === 'boolean') {
    out.preferVoiceNotesAcknowledgment = r.preferVoiceNotesAcknowledgment;
  }

  // Sprint Gamma 2.1
  out.trainerName = sanitizeTrainerName(r.trainerName as string | null | undefined);

  if (typeof r.trainerEmail === 'string' && isValidEmail(r.trainerEmail)) {
    out.trainerEmail = r.trainerEmail.trim().toLowerCase();
  }

  out.trainerPhone = normalizePhoneE164(r.trainerPhone as string | null | undefined);

  // Sprint Gamma 2.2
  out.customInstructions = sanitizeCustomInstructions(r.customInstructions as string | null | undefined);

  return out;
}

const EMOJI_DENSITY_DESCRIPTIONS = {
  0: 'casi sin emojis (máximo 1 emoji cada 3-4 mensajes)',
  1: 'algunos emojis (1 emoji por mensaje, contextual)',
  2: 'densidad moderada (1-2 emojis por mensaje, expresivos pero no saturados)',
  3: 'densidad alta (2-4 emojis por mensaje, muy expresivos)',
} as const;

/**
 * Convierte preferencias estructuradas en markdown que se inyecta al final del
 * system prompt. Determinístico y testeable.
 *
 * NO incluye: trainerEmail, trainerPhone, trainerName (esos viven en BD para
 * inyección dinámica via placeholder en handoff_v4, Sprint Gamma 2.6).
 */
export function serializeTrainerPreferences(prefs: TrainerPreferences): string {
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

  if (prefs.doubleQuestionMark) {
    lines.push(
      '- **Doble interrogación**: cuando termines una frase con pregunta, usa `??` en lugar de `?` ' +
        '(p.ej. "¿qué tal??"). Aplica solo a preguntas explícitas, no a frases declarativas.',
    );
  } else {
    lines.push('- **Interrogación simple**: usa `?` estándar al final de las preguntas.');
  }

  lines.push(`- **Densidad de emojis**: ${EMOJI_DENSITY_DESCRIPTIONS[prefs.emojiDensity]}.`);

  if (prefs.preferVoiceNotesAcknowledgment) {
    lines.push(
      '- **Acknowledge audios**: si el lead envía un audio, menciónalo explícitamente al inicio ' +
        'de tu respuesta (p.ej. "escuché tu audio…", "acabo de oír lo que mandas…").',
    );
  }

  lines.push('');
  lines.push('### Cualificación');
  lines.push('');

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

  // Sprint Gamma 2.2 — Instrucciones libres del trainer
  if (prefs.customInstructions && prefs.customInstructions.length > 0) {
    lines.push('');
    lines.push('### Instrucciones específicas del trainer');
    lines.push('');
    lines.push(
      'El trainer dueño de esta sub-cuenta ha indicado **instrucciones específicas** que debes ' +
        'respetar siempre que no contradigan reglas críticas del Cerebro ni directivas del Coach. ' +
        'Si hay conflicto entre estas instrucciones y el Cerebro/Coach, prevalece el Cerebro/Coach.',
    );
    lines.push('');
    lines.push(prefs.customInstructions);
  }

  lines.push('');
  return lines.join('\n');
}
