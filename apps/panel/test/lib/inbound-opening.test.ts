import { describe, it, expect } from 'vitest';
import {
  AUTO_REPLY_WINDOW_MS,
  isBareKeywordOpening,
  isKeywordFlowOpening,
  normalizeOpening,
} from '../../lib/inbound-opening';
import { isInboundConv } from '../../lib/widget-catalog';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';

/**
 * Inbound de verdad vs flujo de palabra clave (2026-10-21, Tania). Los textos
 * son los que abrieron conversaciones reales del tenant 7 en los últimos 14 días.
 */

const KEYWORDS = ['Espalda', 'Información', 'Info', 'Hernia', 'lumbar', 'cervical', 'programa'];

describe('normalizeOpening', () => {
  it('quita tildes, signos y emojis y colapsa letras repetidas', () => {
    expect(normalizeOpening('Siii😊')).toBe('si');
    expect(normalizeOpening('Hérnia')).toBe('hernia');
    expect(normalizeOpening('Espaldaa')).toBe('espalda');
    expect(normalizeOpening('Démarrer')).toBe('demarer');
    expect(normalizeOpening('  Si,   por favor!! ')).toBe('si por favor');
  });
});

describe('isBareKeywordOpening', () => {
  it('la palabra clave suelta y los botones no son inbound', () => {
    for (const t of ['Espalda', 'espaldaa', 'Hérnia', 'Siii😊', 'Si', 'Empezar', 'Get started', 'Démarrer', 'Começar', 'Ok', 'Si por favor', 'Información']) {
      expect(isBareKeywordOpening(t, KEYWORDS), t).toBe(true);
    }
  });

  it('el botón con un saludo delante tampoco (Facebook, 21 oct)', () => {
    for (const t of ['Hola, Si', 'Buen día si', 'Buenas tardes, si por favor', 'Hola buenas tardes si , por favor', 'Hola gracias si', 'Claro que sí', 'Hola, espalda']) {
      expect(isBareKeywordOpening(t, KEYWORDS), t).toBe(true);
    }
  });

  it('un saludo solo sí cuenta: es alguien que te escribe', () => {
    for (const t of ['Hola', 'Buenas tardes', 'Hola 👋', 'Buenos días']) {
      expect(isBareKeywordOpening(t, KEYWORDS), t).toBe(false);
    }
  });

  it('un mensaje suyo sí lo es, aunque lleve una palabra clave dentro', () => {
    for (const t of [
      'Tengo una hernia y me gustaría saber cómo me puedes ayudar',
      'Hola! Cervical también?',
      'Hola',
      'Hola Tania',
      '¿Eres sanitaria?',
      'Tengo dos hernias, qué programa tienes y qué precio',
    ]) {
      expect(isBareKeywordOpening(t, KEYWORDS), t).toBe(false);
    }
  });

  it('sin texto o vacío tras normalizar, no decide', () => {
    expect(isBareKeywordOpening(null, KEYWORDS)).toBe(false);
    expect(isBareKeywordOpening('😍', KEYWORDS)).toBe(false);
  });
});

describe('isKeywordFlowOpening', () => {
  const at = '2026-10-12T02:03:20Z';
  const plus = (ms: number) => new Date(Date.parse(at) + ms).toISOString();

  it('lo que la automatización contesta en segundos es flujo de palabra clave, aunque no esté en la lista', () => {
    expect(
      isKeywordFlowOpening({ firstLeadText: 'quiero saber lo de la clase', firstLeadAt: at, firstAutoReplyAt: plus(2000), keywordPatterns: [] }),
    ).toBe(true);
  });

  it('una respuesta automática tardía o anterior no cuenta', () => {
    const text = 'Tengo una hernia y me gustaría saber cómo me puedes ayudar';
    expect(isKeywordFlowOpening({ firstLeadText: text, firstLeadAt: at, firstAutoReplyAt: plus(AUTO_REPLY_WINDOW_MS + 1000), keywordPatterns: KEYWORDS })).toBe(false);
    expect(isKeywordFlowOpening({ firstLeadText: text, firstLeadAt: at, firstAutoReplyAt: null, keywordPatterns: KEYWORDS })).toBe(false);
  });
});

describe('isInboundConv', () => {
  const conv = (over: Partial<ConvSnapshot>): ConvSnapshot =>
    ({ id: 1, state: 'open', is_qualified: null, phase_number: 1, channel_id: 1, direction: 'inbound', last_message_at: null, created_at: '2026-10-20T00:00:00Z', ...over }) as ConvSnapshot;

  it('fuera el flujo de palabra clave; dentro lo que escribió ella', () => {
    expect(isInboundConv(conv({ inbound_keyword_flow: true }))).toBe(false);
    expect(isInboundConv(conv({ inbound_keyword_flow: false }))).toBe(true);
    expect(isInboundConv(conv({}))).toBe(true);
    expect(isInboundConv(conv({ direction: 'outbound' }))).toBe(false);
  });
});
