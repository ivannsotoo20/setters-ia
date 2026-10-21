import { describe, expect, it } from 'vitest';
import {
  groupOpenings,
  openingKey,
  suggestPattern,
  SUGGESTED_PATTERN_WORDS,
} from '../../lib/unclassified-openings';

describe('openingKey', () => {
  it('iguala mayúsculas, acentos, emojis, signos y letras alargadas', () => {
    expect(openingKey('Holaaa! Vi que empezaste a seguirme 😊')).toBe(
      openingKey('hola, vi que empezaste a seguirme 🙋🏼‍♀️'),
    );
    expect(openingKey('Hola, por aquí Tânia 😊')).toBe('hola por aqui tania');
  });

  it('un texto sin letras ni números no da clave', () => {
    expect(openingKey('😊👋 !!')).toBe('');
  });
});

describe('suggestPattern', () => {
  it('propone las primeras palabras, sin emojis sueltos ni el signo final', () => {
    expect(
      suggestPattern('Hola, por aquí Tânia 😊 He visto que te interesa saber cómo empezar'),
    ).toBe('Hola, por aquí Tânia He visto que te');
  });

  it(`no pasa de ${SUGGESTED_PATTERN_WORDS} palabras`, () => {
    const words = suggestPattern('uno dos tres cuatro cinco seis siete ocho nueve diez').split(' ');
    expect(words).toHaveLength(SUGGESTED_PATTERN_WORDS);
  });

  it('quita el signo del final', () => {
    expect(suggestPattern('Te doy la bienvenida!')).toBe('Te doy la bienvenida');
  });
});

describe('groupOpenings', () => {
  it('agrupa el mismo texto aunque cambie el emoji y ordena por número de veces', () => {
    const groups = groupOpenings([
      { text: 'Hola! Acabo de ver que te interesa', at: '2026-10-20T10:00:00.000Z' },
      { text: 'Hola, por aquí Tânia 😊', at: '2026-10-19T10:00:00.000Z' },
      { text: 'Hola, por aquí Tânia 🙌', at: '2026-10-20T11:00:00.000Z' },
      { text: 'Hola por aqui Tania', at: '2026-10-18T10:00:00.000Z' },
    ]);

    expect(groups.map((g) => [g.count, g.text])).toEqual([
      [3, 'Hola, por aquí Tânia 🙌'],
      [1, 'Hola! Acabo de ver que te interesa'],
    ]);
    expect(groups[0]?.lastAt).toBe('2026-10-20T11:00:00.000Z');
  });

  it('a igualdad de veces, la más reciente primero', () => {
    const groups = groupOpenings([
      { text: 'Primera apertura', at: '2026-10-18T10:00:00.000Z' },
      { text: 'Segunda apertura', at: '2026-10-20T10:00:00.000Z' },
    ]);
    expect(groups.map((g) => g.text)).toEqual(['Segunda apertura', 'Primera apertura']);
  });

  it('descarta los textos sin letras', () => {
    expect(groupOpenings([{ text: '👋', at: '2026-10-20T10:00:00.000Z' }])).toEqual([]);
  });
});
