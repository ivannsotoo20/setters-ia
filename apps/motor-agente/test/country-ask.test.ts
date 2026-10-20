import { describe, it, expect } from 'vitest';
import {
  buildCountryAsk,
  nextAiTurn,
  parseCountryAskConfig,
  renderCountryAskBlock,
} from '../src/lib/country-ask.js';
import type { ZoneVerdict } from '../src/lib/zone-policy.js';

/**
 * País a tiempo (2026-10-20, V23): cuándo le toca a un turno preguntar desde
 * dónde escribe la persona. Solo en canales sin teléfono, con el país sin
 * decidir, desde el turno configurado de la IA y si no se ha preguntado antes.
 */

const PREGUNTA = 'Por cierto, de dónde me escribes? Te pregunto porque acompaño a personas de distintos países';
const TANIA_LQ = { call_gate: { require_country: true, min_pain_months: 3 } };
const CLEAR: ZoneVerdict = { kind: 'clear' };

const a = (content: string) => ({ role: 'assistant' as const, content });
const u = (content: string) => ({ role: 'user' as const, content });

// Conversación de Instagram que abre la bienvenida de Tania (cuenta como apertura,
// no como turno de la IA) y en la que la IA ya contestó una vez sin preguntar el país.
const IG_TURNO_2 = [
  a('Hola, por aquí Tânia 😊 ¿en qué movimientos notas más molestias?'),
  u('Al agacharme'),
  a('Vaya, se nota que te limita bastante. Y esto desde cuándo lo notas así??'),
];

describe('parseCountryAskConfig', () => {
  it('sin cerrojo no hay nada', () => {
    expect(parseCountryAskConfig(null)).toBeNull();
    expect(parseCountryAskConfig({})).toBeNull();
    expect(parseCountryAskConfig({ call_gate: { min_pain_months: 3 } })).toBeNull();
  });

  it('con require_country se activa en el turno 2', () => {
    expect(parseCountryAskConfig(TANIA_LQ)).toEqual({ byTurn: 2, question: null });
  });

  it('ask_country_by_turn manda: otro turno, tope 5, o 0 para apagarlo', () => {
    expect(parseCountryAskConfig({ call_gate: { require_country: true, ask_country_by_turn: 3 } })?.byTurn).toBe(3);
    expect(parseCountryAskConfig({ call_gate: { require_country: true, ask_country_by_turn: 9 } })?.byTurn).toBe(5);
    expect(parseCountryAskConfig({ call_gate: { require_country: true, ask_country_by_turn: 0 } })).toBeNull();
  });

  it('la frase de la entrenadora es opcional y se recorta', () => {
    const cfg = parseCountryAskConfig({ call_gate: { require_country: true, ask_country_question: `  ${PREGUNTA}  ` } });
    expect(cfg?.question).toBe(PREGUNTA);
  });
});

describe('nextAiTurn', () => {
  it('sin historial, o con solo mensajes suyos, es el primer turno', () => {
    expect(nextAiTurn([])).toBe(1);
    expect(nextAiTurn([u('Hola')])).toBe(1);
  });

  it('la apertura nuestra (bienvenida, palabra clave o plantilla) no cuenta como turno de la IA', () => {
    expect(nextAiTurn([a('Hola, por aquí Tânia 😊'), u('Hola')])).toBe(1);
    expect(nextAiTurn(IG_TURNO_2)).toBe(2);
  });

  it('varias burbujas seguidas son un solo turno', () => {
    expect(nextAiTurn([u('Hola'), a('Hola!'), a('Cuéntame'), u('Me duele')])).toBe(2);
    expect(nextAiTurn([a('Bienvenida'), u('x'), a('1'), a('1b'), u('y'), a('2'), u('z')])).toBe(3);
  });
});

describe('buildCountryAsk', () => {
  it('en Instagram, turno 2 y sin preguntar: toca', () => {
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'instagram_dm', zoneVerdict: CLEAR, history: IG_TURNO_2 }),
    ).toEqual({ turn: 2, question: null });
  });

  it('también en Messenger, y con una mención de país que no es declaración', () => {
    const mention = { kind: 'mention', term: 'Perú', excerpt: 'mi hermana vive en Perú' } as ZoneVerdict;
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'facebook_messenger', zoneVerdict: mention, history: IG_TURNO_2 }),
    ).toEqual({ turn: 2, question: null });
  });

  it('en el primer turno de la IA todavía no', () => {
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'instagram_dm', zoneVerdict: CLEAR, history: IG_TURNO_2.slice(0, 2) }),
    ).toBeUndefined();
  });

  it('si un mensaje nuestro anterior ya lo preguntó, no', () => {
    const history = [...IG_TURNO_2.slice(0, 2), a(`Vaya, se nota que te limita. ${PREGUNTA}`)];
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'instagram_dm', zoneVerdict: CLEAR, history }),
    ).toBeUndefined();
  });

  it('en WhatsApp nunca: decide el prefijo', () => {
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'whatsapp', zoneVerdict: CLEAR, history: IG_TURNO_2 }),
    ).toBeUndefined();
  });

  it('con el país ya decidido por el motor, no', () => {
    const inZone = { kind: 'in_zone_by_prefix', country: { iso: 'ES' } } as unknown as ZoneVerdict;
    expect(
      buildCountryAsk({ leadQualification: TANIA_LQ, channel: 'instagram_dm', zoneVerdict: inZone, history: IG_TURNO_2 }),
    ).toBeUndefined();
  });

  it('sin la config del tenant, no', () => {
    expect(
      buildCountryAsk({ leadQualification: {}, channel: 'instagram_dm', zoneVerdict: CLEAR, history: IG_TURNO_2 }),
    ).toBeUndefined();
  });
});

describe('renderCountryAskBlock', () => {
  it('sin encargo no hay bloque', () => {
    expect(renderCountryAskBlock(undefined)).toBeNull();
  });

  it('con frase, la lleva tal cual; sin ella, remite a la del bloque', () => {
    expect(renderCountryAskBlock({ turn: 2, question: PREGUNTA })).toContain(`«${PREGUNTA}»`);
    expect(renderCountryAskBlock({ turn: 2, question: null })).toContain('la frase de tu bloque');
    expect(renderCountryAskBlock({ turn: 2, question: null })).toContain('lead_country_iso');
  });
});
