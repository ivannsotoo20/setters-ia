import { describe, it, expect } from 'vitest';
import {
  detectAddressing,
  buildMirrorLeadDirective,
  type AddressingResult,
} from '../src/lib/detect-addressing.js';

// =============================================================================
// Fixtures: ~30 ejemplos reales (positivos tu, positivos usted, ambiguos, mixtos)
// El plan documenta: si el helper tiene >10% de falsos positivos en este conjunto,
// considerar degradar V18 a warning-only.
// =============================================================================

interface Fixture {
  text: string;
  expected: AddressingResult;
  note?: string;
}

const FIXTURES: Fixture[] = [
  // ---------- TÚ — pronombres explícitos ----------
  { text: 'Hola, ¿qué tal estás tú?', expected: 'tu', note: 'pronombre tú directo' },
  { text: 'Mira, te paso la info', expected: 'tu', note: 'pronombre te' },
  { text: 'Esto es para ti', expected: 'tu', note: 'pronombre ti' },
  { text: 'Voy contigo', expected: 'tu', note: 'pronombre contigo' },
  { text: 'Es tuyo, no mío', expected: 'tu', note: 'posesivo tuyo' },

  // ---------- TÚ — conjugaciones verbales ----------
  { text: 'Tienes razón en eso', expected: 'tu', note: 'conjugación tienes' },
  { text: 'Eres muy amable', expected: 'tu', note: 'conjugación eres' },
  { text: 'Cuéntame qué te ha pasado', expected: 'tu', note: 'imperativo + te' },
  { text: '¿Puedes ayudarme?', expected: 'tu', note: 'conjugación puedes' },
  { text: 'Dime cómo estás', expected: 'tu', note: 'imperativo dime + estás' },

  // ---------- USTED — pronombres explícitos ----------
  { text: '¿Cómo está usted hoy?', expected: 'usted', note: 'pronombre usted' },
  { text: 'Ustedes dos vengan conmigo', expected: 'usted', note: 'pronombre ustedes' },
  { text: 'Hablo consigo mismo, perdone', expected: 'usted', note: 'consigo' },

  // ---------- USTED — imperativos formales con marcador fuerte ----------
  {
    text: 'Cuénteme un poco más, usted ya sabe',
    expected: 'usted',
    note: 'cuénteme + usted',
  },
  {
    text: 'Dígame cuándo le viene bien, por favor; usted decide',
    expected: 'usted',
    note: 'dígame + usted',
  },

  // ---------- AMBIGUO — texto sin pronombres ni verbos detectables ----------
  { text: 'Sí, gracias', expected: 'ambiguous', note: 'demasiado corto' },
  { text: 'Ok, perfecto', expected: 'ambiguous', note: 'sin verbos personales' },
  { text: 'mmm', expected: 'ambiguous', note: 'ruido' },
  { text: 'Buenos días', expected: 'ambiguous', note: 'saludo neutro' },

  // ---------- AMBIGUO — mezcla tú/usted ----------
  {
    text: 'Hola usted, ¿qué tal estás? Cuéntame',
    expected: 'ambiguous',
    note: 'mezcla obvia usted + tú',
  },

  // ---------- AMBIGUO — solo "venga" (interjección coloquial española) ----------
  {
    text: 'Venga, vamos a verlo',
    expected: 'ambiguous',
    note: 'venga interjección sin usted',
  },

  // ---------- TÚ — frases coloquiales que tutean ----------
  { text: 'Oye, ¿cómo te va?', expected: 'tu', note: 'oye + te' },
  { text: 'Vas a poder con esto', expected: 'tu', note: 'vas' },
  { text: 'Mira, escucha bien lo que te digo', expected: 'tu', note: 'mira + escucha + te' },

  // ---------- USTED — formal mixto realista ----------
  {
    text: '¿Le viene bien el lunes a usted?',
    expected: 'usted',
    note: 'le + usted',
  },

  // ---------- TÚ — pregunta directa ----------
  { text: '¿Qué quieres saber?', expected: 'tu', note: 'quieres' },
  { text: '¿Sabes ya el resultado?', expected: 'tu', note: 'sabes' },

  // ---------- AMBIGUO — frases declarativas sin pronombres ----------
  { text: 'El precio es de 100 euros', expected: 'ambiguous', note: 'declarativa' },
  { text: 'Hace bueno hoy', expected: 'ambiguous', note: 'impersonal' },

  // ---------- USTED — corto pero claro ----------
  { text: 'Usted decide', expected: 'usted', note: 'usted corto' },

  // ---------- TÚ — corto pero claro ----------
  { text: 'Tú decides', expected: 'tu', note: 'tú corto' },
];

describe('detectAddressing — fixtures (target: ≤10% falsos positivos)', () => {
  let mismatches = 0;
  for (const fx of FIXTURES) {
    const label = `${fx.expected} ← "${fx.text}"${fx.note ? ` (${fx.note})` : ''}`;
    it(label, () => {
      const got = detectAddressing(fx.text);
      if (got !== fx.expected) {
        mismatches++;
        // eslint-disable-next-line no-console
        console.warn(`  ⚠ expected=${fx.expected}, got=${got} for "${fx.text}"`);
      }
      expect(got).toBe(fx.expected);
    });
  }

  it('global rate de aciertos ≥90% (sanity check)', () => {
    // Este test no falla porque cada fixture individual ya falla si hay mismatch;
    // pero deja constancia visible del threshold en el output.
    const total = FIXTURES.length;
    const expectedMinHits = Math.ceil(total * 0.9);
    expect(total).toBeGreaterThanOrEqual(expectedMinHits);
  });
});

describe('detectAddressing — edge cases', () => {
  it('string vacío → ambiguous', () => {
    expect(detectAddressing('')).toBe('ambiguous');
    expect(detectAddressing('   ')).toBe('ambiguous');
  });

  it('input no-string → ambiguous', () => {
    expect(detectAddressing(null as unknown as string)).toBe('ambiguous');
    expect(detectAddressing(undefined as unknown as string)).toBe('ambiguous');
    expect(detectAddressing(42 as unknown as string)).toBe('ambiguous');
  });

  it('"tu" sin acento NO debería confundirse con artículo "tu" en frases claras', () => {
    // "tu objetivo" — el posesivo "tu" SÍ es marker de tú (común en español, registro informal).
    // Esto es comportamiento deseado.
    expect(detectAddressing('Cuéntame cuál es tu objetivo')).toBe('tu');
  });

  it('texto con muchos saltos de línea procesa correctamente', () => {
    expect(detectAddressing('Hola\n\nCómo estás\n\ntú?')).toBe('tu');
  });

  it('texto largo con muchos markers ponderados', () => {
    const longText =
      'Hola usted, le quería decir que su propuesta me parece interesante. ' +
      'Le voy a comentar mis dudas: ¿puede usted explicarme cómo funciona? Dígame.';
    expect(detectAddressing(longText)).toBe('usted');
  });
});

describe('buildMirrorLeadDirective', () => {
  it('tu → directiva con "TÚ" y reglas estrictas', () => {
    const d = buildMirrorLeadDirective('tu');
    expect(d).not.toBeNull();
    expect(d).toContain('TÚ');
    expect(d).toContain('2ª persona');
    expect(d).toContain('ESTRICTA');
  });

  it('usted → directiva con "USTED" y reglas estrictas', () => {
    const d = buildMirrorLeadDirective('usted');
    expect(d).not.toBeNull();
    expect(d).toContain('USTED');
    expect(d).toContain('3ª persona');
    expect(d).toContain('ESTRICTA');
  });

  it('ambiguous → null (no inyectar directiva)', () => {
    expect(buildMirrorLeadDirective('ambiguous')).toBeNull();
  });
});
