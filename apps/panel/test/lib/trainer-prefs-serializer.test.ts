import { describe, it, expect } from 'vitest';
import {
  serializeTrainerPreferences,
  parseTrainerPreferences,
  DEFAULT_TRAINER_PREFERENCES,
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
