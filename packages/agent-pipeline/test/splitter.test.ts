import { describe, it, expect } from 'vitest';
import { deterministicSplit } from '../src/splitter.js';

describe('deterministicSplit fallback', () => {
  it('returns single part if text fits', () => {
    expect(deterministicSplit('Hola pana, ¿qué tal?')).toEqual(['Hola pana, ¿qué tal?']);
  });

  it('returns single part if text fits even with double newline (fast path)', () => {
    // El fast path devuelve texto completo si <= 280 chars, sin partir.
    const text = 'Genial!\n\nOye, ¿cómo va la chamba?';
    expect(deterministicSplit(text)).toEqual([text]);
  });

  it('splits by double newline when text exceeds 280 chars', () => {
    const p1 = 'a'.repeat(150);
    const p2 = 'b'.repeat(150);
    const text = `${p1}\n\n${p2}`;
    const out = deterministicSplit(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(p1);
    expect(out[1]).toBe(p2);
  });

  it('splits by sentence when paragraph split not natural', () => {
    const text =
      'Verga, eso tiene que ser frustrante. Cuando dices que lo dejas a las dos semanas, ¿qué pasa en ese punto? Cuéntame algo mas.';
    const out = deterministicSplit(
      text + ' '.repeat(Math.max(0, 281 - text.length)) + 'extra word here.',
    );
    // Está sobre 280, splittear por frase
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((p) => p.length <= 280)).toBe(true);
  });

  it('hard splits when no natural break is available', () => {
    const longBlob = 'a'.repeat(700);
    const out = deterministicSplit(longBlob);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((p) => p.length <= 280)).toBe(true);
  });
});
