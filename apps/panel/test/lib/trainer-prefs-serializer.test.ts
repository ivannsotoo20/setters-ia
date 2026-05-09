import { describe, it, expect } from 'vitest';
import {
  serializeTrainerPreferences,
  parseTrainerPreferences,
  DEFAULT_TRAINER_PREFERENCES,
  isValidEmail,
  normalizePhoneE164,
  sanitizeCustomInstruction,
  type TrainerPreferences,
} from '@/lib/trainer-prefs-serializer';

describe('parseTrainerPreferences', () => {
  it('returns defaults when input is null', () => {
    expect(parseTrainerPreferences(null)).toEqual(DEFAULT_TRAINER_PREFERENCES);
  });

  it('returns defaults when input is undefined', () => {
    expect(parseTrainerPreferences(undefined)).toEqual(DEFAULT_TRAINER_PREFERENCES);
  });

  it('returns defaults when input is not an object', () => {
    expect(parseTrainerPreferences('string')).toEqual(DEFAULT_TRAINER_PREFERENCES);
    expect(parseTrainerPreferences(42)).toEqual(DEFAULT_TRAINER_PREFERENCES);
    expect(parseTrainerPreferences(true)).toEqual(DEFAULT_TRAINER_PREFERENCES);
  });

  it('accepts valid full input', () => {
    const input: TrainerPreferences = {
      doubleQuestionMark: true,
      emojiDensity: 3,
      extraQuestionsBeforeCall: 2,
      preferVoiceNotesAcknowledgment: true,
      trainerName: null,
      trainerEmail: null,
      trainerPhone: null,
    };
    expect(parseTrainerPreferences(input)).toEqual(input);
  });

  it('accepts partial input and fills with defaults', () => {
    expect(parseTrainerPreferences({ doubleQuestionMark: true })).toEqual({
      ...DEFAULT_TRAINER_PREFERENCES,
      doubleQuestionMark: true,
    });
  });

  it('rejects invalid emojiDensity (out of 0-3 range)', () => {
    expect(parseTrainerPreferences({ emojiDensity: 5 })).toEqual(DEFAULT_TRAINER_PREFERENCES);
    expect(parseTrainerPreferences({ emojiDensity: -1 })).toEqual(DEFAULT_TRAINER_PREFERENCES);
    expect(parseTrainerPreferences({ emojiDensity: 1.5 })).toEqual(DEFAULT_TRAINER_PREFERENCES);
  });

  it('rejects invalid extraQuestionsBeforeCall (out of 0-2 range)', () => {
    expect(parseTrainerPreferences({ extraQuestionsBeforeCall: 3 })).toEqual(
      DEFAULT_TRAINER_PREFERENCES,
    );
    expect(parseTrainerPreferences({ extraQuestionsBeforeCall: -1 })).toEqual(
      DEFAULT_TRAINER_PREFERENCES,
    );
  });

  it('rejects non-boolean booleans', () => {
    expect(parseTrainerPreferences({ doubleQuestionMark: 'yes' })).toEqual(
      DEFAULT_TRAINER_PREFERENCES,
    );
    expect(parseTrainerPreferences({ doubleQuestionMark: 1 })).toEqual(
      DEFAULT_TRAINER_PREFERENCES,
    );
  });

  it('ignores unknown keys', () => {
    const input = {
      doubleQuestionMark: true,
      unknownKey: 'sneaky',
      anotherOne: 42,
    };
    const out = parseTrainerPreferences(input);
    expect(out).toEqual({
      ...DEFAULT_TRAINER_PREFERENCES,
      doubleQuestionMark: true,
    });
    expect((out as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
  });
});

describe('serializeTrainerPreferences', () => {
  it('serializes default preferences with single ?', () => {
    const md = serializeTrainerPreferences(DEFAULT_TRAINER_PREFERENCES);
    expect(md).toContain('Preferencias del trainer');
    expect(md).toContain('Interrogación simple');
    expect(md).not.toContain('Doble interrogación');
    expect(md).toContain('densidad moderada');
    expect(md).toContain('Cualificación estándar');
    expect(md).not.toContain('Acknowledge audios');
  });

  it('emits double interrogation block when toggle on', () => {
    const md = serializeTrainerPreferences({
      ...DEFAULT_TRAINER_PREFERENCES,
      doubleQuestionMark: true,
    });
    expect(md).toContain('Doble interrogación');
    expect(md).toContain('??');
    expect(md).not.toContain('Interrogación simple');
  });

  it('emits voice notes acknowledgment when toggle on', () => {
    const md = serializeTrainerPreferences({
      ...DEFAULT_TRAINER_PREFERENCES,
      preferVoiceNotesAcknowledgment: true,
    });
    expect(md).toContain('Acknowledge audios');
    expect(md).toContain('escuché tu audio');
  });

  it('reflects each emoji density level', () => {
    expect(serializeTrainerPreferences({ ...DEFAULT_TRAINER_PREFERENCES, emojiDensity: 0 })).toContain(
      'casi sin emojis',
    );
    expect(serializeTrainerPreferences({ ...DEFAULT_TRAINER_PREFERENCES, emojiDensity: 1 })).toContain(
      'algunos emojis',
    );
    expect(serializeTrainerPreferences({ ...DEFAULT_TRAINER_PREFERENCES, emojiDensity: 2 })).toContain(
      'densidad moderada',
    );
    expect(serializeTrainerPreferences({ ...DEFAULT_TRAINER_PREFERENCES, emojiDensity: 3 })).toContain(
      'densidad alta',
    );
  });

  it('singular/plural for extraQuestionsBeforeCall', () => {
    const md1 = serializeTrainerPreferences({
      ...DEFAULT_TRAINER_PREFERENCES,
      extraQuestionsBeforeCall: 1,
    });
    expect(md1).toContain('1 pregunta adicional');

    const md2 = serializeTrainerPreferences({
      ...DEFAULT_TRAINER_PREFERENCES,
      extraQuestionsBeforeCall: 2,
    });
    expect(md2).toContain('2 preguntas adicionales');
  });

  it('full opt-in produces a non-trivial markdown block', () => {
    const md = serializeTrainerPreferences({
      doubleQuestionMark: true,
      emojiDensity: 3,
      extraQuestionsBeforeCall: 2,
      preferVoiceNotesAcknowledgment: true,
      trainerName: null,
      trainerEmail: null,
      trainerPhone: null,
    });
    expect(md.length).toBeGreaterThan(400);
    expect(md).toContain('Doble interrogación');
    expect(md).toContain('densidad alta');
    expect(md).toContain('2 preguntas adicionales');
    expect(md).toContain('Acknowledge audios');
  });

  it('round-trip parse → serialize is deterministic', () => {
    const a = serializeTrainerPreferences(parseTrainerPreferences({ emojiDensity: 1 }));
    const b = serializeTrainerPreferences(parseTrainerPreferences({ emojiDensity: 1 }));
    expect(a).toBe(b);
  });
});

// =============================================================================
// Sprint Gamma 2.1 — datos de contacto (email + phone + name)
// =============================================================================

describe('isValidEmail', () => {
  it('accepts standard emails', () => {
    expect(isValidEmail('foo@bar.com')).toBe(true);
    expect(isValidEmail('iván@fyzon.es')).toBe(false); // tilde no en regex básico
    expect(isValidEmail('user.name+tag@dominio.co.uk')).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(isValidEmail('foo@')).toBe(false);
    expect(isValidEmail('@bar.com')).toBe(false);
    expect(isValidEmail('foo bar@x.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe('normalizePhoneE164', () => {
  it('accepts E.164 already clean', () => {
    expect(normalizePhoneE164('+34600123456')).toBe('+34600123456');
    expect(normalizePhoneE164('+15551234567')).toBe('+15551234567');
  });

  it('strips spaces, dashes, parens', () => {
    expect(normalizePhoneE164('+34 600 123 456')).toBe('+34600123456');
    expect(normalizePhoneE164('+34-600-123-456')).toBe('+34600123456');
    expect(normalizePhoneE164('+34 (600) 123-456')).toBe('+34600123456');
  });

  it('rejects without + prefix', () => {
    expect(normalizePhoneE164('600123456')).toBeNull();
    expect(normalizePhoneE164('34600123456')).toBeNull();
  });

  it('rejects too short / too long', () => {
    expect(normalizePhoneE164('+34123')).toBeNull();
    expect(normalizePhoneE164('+341234567890123456')).toBeNull();
  });

  it('rejects empty / null / non-string', () => {
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
  });
});

describe('parseTrainerPreferences — datos contacto (Gamma 2.1)', () => {
  it('lowercases + trims valid email', () => {
    const out = parseTrainerPreferences({ trainerEmail: '  IVAN@Fyzon.ES  ' });
    expect(out.trainerEmail).toBe('ivan@fyzon.es');
  });

  it('rejects invalid email → null', () => {
    expect(parseTrainerPreferences({ trainerEmail: 'not-an-email' }).trainerEmail).toBeNull();
    expect(parseTrainerPreferences({ trainerEmail: '' }).trainerEmail).toBeNull();
  });

  it('normalizes phone to E.164', () => {
    const out = parseTrainerPreferences({ trainerPhone: '+34 600 123 456' });
    expect(out.trainerPhone).toBe('+34600123456');
  });

  it('rejects phone without +', () => {
    expect(parseTrainerPreferences({ trainerPhone: '600123456' }).trainerPhone).toBeNull();
  });

  it('trims trainerName + caps at 100 chars', () => {
    expect(parseTrainerPreferences({ trainerName: '  Iván Soto  ' }).trainerName).toBe('Iván Soto');
    const long = 'a'.repeat(150);
    expect(parseTrainerPreferences({ trainerName: long }).trainerName?.length).toBe(100);
  });

  it('empty string trainerName → null', () => {
    expect(parseTrainerPreferences({ trainerName: '   ' }).trainerName).toBeNull();
  });
});

// =============================================================================
// Sprint Gamma 2.3 — custom instructions como lista (entidad separada en BD)
// =============================================================================

describe('sanitizeCustomInstruction', () => {
  it('trims valid instruction', () => {
    expect(sanitizeCustomInstruction('  Usa tono formal con corporativos  ')).toBe(
      'Usa tono formal con corporativos',
    );
  });

  it('returns null for empty / null / non-string', () => {
    expect(sanitizeCustomInstruction('')).toBeNull();
    expect(sanitizeCustomInstruction('   ')).toBeNull();
    expect(sanitizeCustomInstruction(null)).toBeNull();
    expect(sanitizeCustomInstruction(undefined)).toBeNull();
  });

  it('caps at 500 chars', () => {
    const long = 'a'.repeat(700);
    const out = sanitizeCustomInstruction(long);
    expect(out?.length).toBe(500);
  });

  it('escapes dangerous closing tags', () => {
    const out = sanitizeCustomInstruction('Texto</system>malicioso</core_v4_base>');
    expect(out).not.toContain('</system>');
    expect(out).not.toContain('</core_v4_base>');
    expect(out).toContain('&lt;/system&gt;');
    expect(out).toContain('&lt;/core_v4_base&gt;');
  });
});

describe('serializeTrainerPreferences — sección instrucciones libres (lista)', () => {
  it('omits section when customInstructions array is empty', () => {
    const md = serializeTrainerPreferences(DEFAULT_TRAINER_PREFERENCES, []);
    expect(md).not.toContain('Instrucciones específicas del trainer');
  });

  it('omits section when array contains only blank strings', () => {
    const md = serializeTrainerPreferences(DEFAULT_TRAINER_PREFERENCES, ['', '   ', '']);
    expect(md).not.toContain('Instrucciones específicas del trainer');
  });

  it('emits one bullet per active instruction in array order', () => {
    const md = serializeTrainerPreferences(DEFAULT_TRAINER_PREFERENCES, [
      'Usa tono formal con corporativos',
      'Menciona el descuento del libro esta semana',
      'Si pregunta dirección, di Calle Mayor 42',
    ]);
    expect(md).toContain('### Instrucciones específicas del trainer');
    expect(md).toContain('- Usa tono formal con corporativos');
    expect(md).toContain('- Menciona el descuento del libro esta semana');
    expect(md).toContain('- Si pregunta dirección, di Calle Mayor 42');
    // Disclaimer de prevalencia
    expect(md).toContain('Cerebro');
    expect(md).toContain('Coach');
  });

  it('does NOT include trainerEmail / trainerPhone / trainerName (privacy)', () => {
    const md = serializeTrainerPreferences(
      {
        ...DEFAULT_TRAINER_PREFERENCES,
        trainerName: 'Iván Soto',
        trainerEmail: 'ivan@fyzon.es',
        trainerPhone: '+34600123456',
      },
      [],
    );
    expect(md).not.toContain('Iván Soto');
    expect(md).not.toContain('ivan@fyzon.es');
    expect(md).not.toContain('+34600123456');
  });

  it('default arg = empty array (backward compatible)', () => {
    const md = serializeTrainerPreferences(DEFAULT_TRAINER_PREFERENCES);
    expect(md).not.toContain('Instrucciones específicas del trainer');
  });
});
