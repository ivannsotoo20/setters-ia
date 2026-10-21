import { describe, expect, it } from 'vitest';
import { asksForPrice, buildPriceGate, parsePriceFirstStepText } from '../src/lib/price-policy.js';

/**
 * D2 (2026-10-21, Tania) — la cifra del precio solo después de la primera frase.
 * Con Elena (9 oct) la IA dio la cifra a la primera.
 */

const PRIMERA =
  'Claro, entiendo que el precio sea importante para ti. Pero antes creo que lo más importante es saber si realmente soy la persona adecuada para ayudarte.';

const LQ = {
  allowed_price_text: 'entre 200 y 1.200 €',
  price_first_step_text: PRIMERA,
};

const ai = (content: string) => ({ role: 'assistant' as const, content });
const lead = (content: string) => ({ role: 'user' as const, content });

describe('parsePriceFirstStepText', () => {
  it('lee la frase y normaliza los espacios', () => {
    expect(parsePriceFirstStepText({ price_first_step_text: `  ${PRIMERA.replace(' ', '   ')} ` })).toBe(PRIMERA);
  });

  it('sin la clave, vacía o con otro tipo, no hay frase', () => {
    expect(parsePriceFirstStepText({})).toBeNull();
    expect(parsePriceFirstStepText({ price_first_step_text: '   ' })).toBeNull();
    expect(parsePriceFirstStepText({ price_first_step_text: 42 })).toBeNull();
    expect(parsePriceFirstStepText(null)).toBeNull();
  });
});

describe('buildPriceGate', () => {
  it('sin precio autorizado o sin primera frase no hay cerrojo: todo como antes', () => {
    expect(buildPriceGate({ leadQualification: { allowed_price_text: 'entre 200 y 1.200 €' }, history: [] })).toBeUndefined();
    expect(buildPriceGate({ leadQualification: { price_first_step_text: PRIMERA }, history: [] })).toBeUndefined();
  });

  it('si la IA aún no ha dado la primera frase, la cifra está bloqueada', () => {
    const gate = buildPriceGate({
      leadQualification: LQ,
      history: [ai('Hola, por aquí Tânia 😊'), lead('Cuánto cuesta?')],
    });
    expect(gate).toEqual({ firstStepText: PRIMERA, firstStepDone: false });
  });

  it('si ya la dio, la cifra queda libre', () => {
    const gate = buildPriceGate({ leadQualification: LQ, history: [lead('Cuánto cuesta?'), ai(PRIMERA)] });
    expect(gate?.firstStepDone).toBe(true);
  });

  it('la encuentra aunque el Splitter la partiera en dos burbujas', () => {
    const gate = buildPriceGate({
      leadQualification: LQ,
      history: [
        lead('Cuánto cuesta?'),
        ai('Claro, entiendo que el precio sea importante para ti 😊'),
        ai('Pero antes creo que lo más importante es saber si realmente soy la persona adecuada para ayudarte'),
      ],
    });
    expect(gate?.firstStepDone).toBe(true);
  });

  it('si ya preguntó y se le contestó sin la cifra, aunque no fuera con la primera frase, insistir la abre', () => {
    const gate = buildPriceGate({
      leadQualification: LQ,
      history: [lead('Cuánto cuesta?'), ai('Eso lo vemos en la videollamada, ¿te parece?')],
    });
    expect(gate?.firstStepDone).toBe(true);
  });

  it('una pregunta de precio sin contestar todavía no cuenta', () => {
    const gate = buildPriceGate({ leadQualification: LQ, history: [ai('Hola 😊'), lead('Cuánto cuesta?')] });
    expect(gate?.firstStepDone).toBe(false);
  });

  it('lo que escribió la persona no cuenta, aunque repita la frase', () => {
    const gate = buildPriceGate({ leadQualification: LQ, history: [lead(PRIMERA)] });
    expect(gate?.firstStepDone).toBe(false);
  });

  it('si ya preguntó el precio en un turno anterior, insistir abre la cifra aunque la IA parafraseara', () => {
    const gate = buildPriceGate({
      leadQualification: LQ,
      history: [
        lead('Dime el precio sin rodeos, ¿cuánto cuesta?'),
        ai('Entiendo que quieras tener una referencia, pero antes de hablar de precio me gustaría saber si de verdad puedo ayudarte'),
      ],
    });
    expect(gate?.firstStepDone).toBe(true);
  });
});

describe('asksForPrice', () => {
  it('reconoce las formas de preguntar el precio', () => {
    for (const t of ['¿Cuánto cuesta?', 'cuanto vale lo tuyo', 'Qué precio tiene', 'cuánto cobras?', 'y la tarifa?', 'cuánto cuesta cada sesión']) {
      expect(asksForPrice(t)).toBe(true);
    }
  });

  it('no confunde otras preguntas', () => {
    for (const t of ['Cuánto tiempo dura?', 'Cuántos días a la semana?', 'Me duele mucho', 'Cuánto tardaré en mejorar?']) {
      expect(asksForPrice(t)).toBe(false);
    }
  });
});
