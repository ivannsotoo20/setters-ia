import { describe, it, expect } from 'vitest';
import { deterministicSplit, buildSplitMessageTool, splitMessageTool } from '../src/splitter.js';

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

// =============================================================================
// Hito 12.1 — maxParts dinámico en Splitter
// =============================================================================

describe('Hito 12.1 — deterministicSplit cap dinámico', () => {
  it('cap default es 4 (preserva comportamiento previo)', () => {
    // Texto que naturalmente parte en 4 con doble-newline.
    const text = ['a'.repeat(150), 'b'.repeat(150), 'c'.repeat(150), 'd'.repeat(150)].join('\n\n');
    const out = deterministicSplit(text);
    expect(out).toHaveLength(4);
  });

  it('cap=1 fuerza una sola parte (último elemento contiene todo el resto)', () => {
    const text = ['a'.repeat(150), 'b'.repeat(150), 'c'.repeat(150)].join('\n\n');
    const out = deterministicSplit(text, 1);
    // Con cap=1 el split por párrafo no aplica (3 > 1), se va a hard-split.
    // El loop hard-split corta hasta cap-1 = 0 iteraciones → out queda con 1 elemento (todo).
    expect(out).toHaveLength(1);
  });

  it('cap=2 limita a 2 partes incluso si el texto tiene 4 párrafos', () => {
    const text = ['a'.repeat(150), 'b'.repeat(150), 'c'.repeat(150), 'd'.repeat(150)].join('\n\n');
    const out = deterministicSplit(text, 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('cap=3 permite hasta 3 partes naturales', () => {
    const text = ['a'.repeat(150), 'b'.repeat(150), 'c'.repeat(150)].join('\n\n');
    const out = deterministicSplit(text, 3);
    expect(out).toHaveLength(3);
  });

  it('fast path NO depende del cap (siempre devuelve 1 si cabe en 280)', () => {
    const text = 'corto';
    expect(deterministicSplit(text, 1)).toEqual([text]);
    expect(deterministicSplit(text, 4)).toEqual([text]);
  });
});

describe('Hito 12.1 — buildSplitMessageTool factory', () => {
  it('default genera maxItems=4', () => {
    const tool = buildSplitMessageTool();
    const schema = tool.input_schema as { properties: { parts: { maxItems: number } } };
    expect(schema.properties.parts.maxItems).toBe(4);
  });

  it('maxParts=1 → maxItems=1 en el schema de la tool', () => {
    const tool = buildSplitMessageTool(1);
    const schema = tool.input_schema as { properties: { parts: { maxItems: number } } };
    expect(schema.properties.parts.maxItems).toBe(1);
  });

  it('maxParts=2 → maxItems=2', () => {
    const tool = buildSplitMessageTool(2);
    const schema = tool.input_schema as { properties: { parts: { maxItems: number } } };
    expect(schema.properties.parts.maxItems).toBe(2);
  });

  it('description interpola el cap (1-N mensajes)', () => {
    expect(buildSplitMessageTool(2).description).toContain('1-2');
    expect(buildSplitMessageTool(3).description).toContain('1-3');
  });

  it('export legacy `splitMessageTool` equivale al cap default (4)', () => {
    const legacy = splitMessageTool.input_schema as { properties: { parts: { maxItems: number } } };
    expect(legacy.properties.parts.maxItems).toBe(4);
  });
});
