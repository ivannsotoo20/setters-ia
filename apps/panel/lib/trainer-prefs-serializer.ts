/**
 * Serializa preferencias estructuradas del trainer a markdown que se inserta
 * como `prompt_blocks.block_key='trainer_prefs_v1'` (sort_order=110, al final
 * del prompt compuesto).
 *
 * Schema CERRADO: solo los toggles aquí definidos pueden persistirse. Cualquier
 * otra clave en el JSON de entrada se ignora silenciosamente.
 *
 * Validación a mano (sin Zod) para no añadir dependencias nuevas al panel.
 *
 * Plan: ~/.claude/plans/admin-edita-cerebro-coach-prefs-2026-05-09.md
 */

export interface TrainerPreferences {
  /** Termina las preguntas con `??` en lugar de `?`. */
  doubleQuestionMark: boolean;
  /** Densidad de emojis: 0=casi sin emojis, 1=algunos, 2=moderada (default), 3=abundante. */
  emojiDensity: 0 | 1 | 2 | 3;
  /** Preguntas adicionales antes de proponer la llamada (0-2). */
  extraQuestionsBeforeCall: 0 | 1 | 2;
  /** Si lead manda audio, mencionarlo explícitamente en la respuesta. */
  preferVoiceNotesAcknowledgment: boolean;
}

export const DEFAULT_TRAINER_PREFERENCES: TrainerPreferences = {
  doubleQuestionMark: false,
  emojiDensity: 2,
  extraQuestionsBeforeCall: 0,
  preferVoiceNotesAcknowledgment: false,
};

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

  lines.push('');
  return lines.join('\n');
}
