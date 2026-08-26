import { describe, it, expect } from 'vitest';
import { deterministicSplit, buildSplitMessageTool, splitMessageTool, splitUrlIntoOwnPart, splitQuestionIntoOwnPart, runSplitter } from '../src/splitter.js';

/** Supabase falso: runSplitter solo escribe en llm_calls y solo si llama al modelo. */
function makeFakeSupabase() {
  const b = {
    insert: () => b, select: () => b,
    single: () => Promise.resolve({ data: { id: 1 }, error: null }),
  };
  return { from: () => b } as never;
}

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

describe('splitUrlIntoOwnPart — el enlace va en su propia burbuja', () => {
  // El caso real que lo motivó: el mensaje de fase 6 con el enlace mide ~160
  // chars, el fast path lo devolvía como UNA burbuja con texto+URL pegados, y
  // los coach ordenan "el enlace en su propia burbuja".
  const URL = 'https://api.leadconnectorhq.com/widget/booking/abc123?fyzon_lead_uuid=xyz';

  it('separa texto + URL en dos burbujas', () => {
    const out = splitUrlIntoOwnPart(`Te dejo el enlace para que agendes:\n\n${URL}`, 3);
    expect(out).toEqual(['Te dejo el enlace para que agendes:', URL]);
  });

  it('separa antes + URL + después en tres burbujas si el cap lo permite', () => {
    const out = splitUrlIntoOwnPart(`Genial, te lo dejo aquí:\n\n${URL}\n\nAvísame cuando reserves`, 3);
    expect(out).toEqual(['Genial, te lo dejo aquí:', URL, 'Avísame cuando reserves']);
  });

  it('con cap 2 y tres trozos, el remate cuelga de la URL sin perder palabras', () => {
    const out = splitUrlIntoOwnPart(`Te lo dejo aquí:\n\n${URL}\n\nAvísame`, 2);
    expect(out).toEqual(['Te lo dejo aquí:', `${URL}\n\nAvísame`]);
  });

  it('no toca una URL que ya va sola', () => {
    expect(splitUrlIntoOwnPart(URL, 3)).toBeNull();
  });

  it('no aplica sin URL, con varias URLs o con cap 1', () => {
    expect(splitUrlIntoOwnPart('sin enlace ninguno', 3)).toBeNull();
    expect(splitUrlIntoOwnPart(`mira ${URL} y también https://otra.com/x`, 3)).toBeNull();
    expect(splitUrlIntoOwnPart(`texto ${URL}`, 1)).toBeNull();
  });
});

// =============================================================================
// 2026-08-26 — El acuse y la pregunta son dos burbujas.
//
// Caso real del tenant 7: el turno salió de una pieza porque medía 156 chars y
// el atajo de ≤280 lo devolvía entero. El bloque del coach ya mandaba "una sola
// pregunta por turno, SIEMPRE en la última burbuja", pero el mecanismo nunca le
// daba la oportunidad de cumplirlo.
// =============================================================================

describe('splitQuestionIntoOwnPart', () => {
  const REAL =
    'Más de un año con esa contractura lumbar que vuelve una y otra vez, y encima tantas horas sentado no ayuda. Qué es lo que más te limita de esto en tu día a día?';

  it('separa el acuse de la pregunta en el turno real que lo motivó', () => {
    const out = splitQuestionIntoOwnPart(REAL, 3);
    expect(out).toHaveLength(2);
    expect(out![0]).toBe(
      'Más de un año con esa contractura lumbar que vuelve una y otra vez, y encima tantas horas sentado no ayuda.',
    );
    expect(out![1]).toBe('Qué es lo que más te limita de esto en tu día a día?');
  });

  it('corta por salto de línea cuando el acuse no lleva punto (regla "sin punto final")', () => {
    const out = splitQuestionIntoOwnPart('genial\n\nqué es lo que más te limita?', 3);
    expect(out).toEqual(['genial', 'qué es lo que más te limita?']);
  });

  it('no parte cuando la pregunta ES el turno entero', () => {
    expect(splitQuestionIntoOwnPart('Qué es lo que más te limita?', 3)).toBeNull();
  });

  it('no parte un turno que no cierra en pregunta', () => {
    expect(splitQuestionIntoOwnPart('Perfecto, te escribo esta tarde', 3)).toBeNull();
  });

  it('respeta el cap de 1 burbuja del trainer', () => {
    expect(splitQuestionIntoOwnPart(REAL, 1)).toBeNull();
  });

  it('con varias preguntas deja la última sola y el resto como acuse', () => {
    const out = splitQuestionIntoOwnPart('Vaya. Y cuánto llevas así? Qué has probado?', 3);
    expect(out).toHaveLength(2);
    expect(out![1]).toBe('Qué has probado?');
  });
});

describe('runSplitter — vía rápida ≤280 chars', () => {
  it('el turno corto con acuse + pregunta ya NO sale de una pieza', async () => {
    const out = await runSplitter(
      { supabase: makeFakeSupabase(), anthropic: {} as never },
      {
        finalText:
          'Años con dolor dorsal y sin que nadie te haya dado un plan. Qué es lo que más te limita?',
        channel: 'whatsapp',
        tenantId: 7,
        conversationId: 1,
        maxParts: 3,
      },
    );
    expect(out.parts).toHaveLength(2);
    expect(out.parts[1]).toBe('Qué es lo que más te limita?');
    // Sigue siendo la vía barata: cero llamadas al modelo.
    expect(out.usage.costUsd).toBe(0);
  });
});
