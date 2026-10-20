import { describe, it, expect } from 'vitest';
import {
  computeWidget,
  selectWidgetMembers,
  isInboundConv,
  hasTeamReply,
} from '../../lib/widget-catalog';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

/**
 * Métricas de inbound (2026-10-20, petición de Tania).
 *
 * Lo que protege este fichero:
 *   1. "Inbound" es la DIRECCIÓN (la persona escribió primero), no la etiqueta
 *      'inbound' de la palabra clave: un outbound de Tania con "espalda" lleva
 *      `conversation_source='inbound'` y NO es un inbound.
 *   2. "Atendido" es que la entrenadora o la IA contestaron (`has_team_reply`).
 *   3. La tarjeta y la lista del drill-down salen de la misma selección.
 */

function conv(overrides: Partial<ConvSnapshot> = {}): ConvSnapshot {
  return {
    id: 1,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 2,
    direction: 'inbound',
    last_message_at: '2026-10-19T12:00:00Z',
    created_at: '2026-10-19T12:00:00Z',
    conversation_source: null,
    ...overrides,
  };
}

const channelMap = new Map<number, ChannelInfo>([
  [1, { kind: 'whatsapp' }],
  [2, { kind: 'instagram_dm' }],
]);

// La foto del tenant 7 desde el 8 oct, en pequeño: inbound de Instagram sin
// palabra clave que nadie contestó, uno que contestó Tania, uno que activó la
// IA por palabra clave, un inbound de WhatsApp, y outbound que no cuentan.
const CURRENT: ConvSnapshot[] = [
  conv({ id: 1, has_team_reply: false }),
  conv({ id: 2, has_team_reply: false }),
  conv({ id: 3, has_team_reply: true }),
  conv({ id: 4, conversation_source: 'inbound', has_team_reply: true }),
  conv({ id: 5, channel_id: 1, has_team_reply: true }),
  conv({ id: 6, direction: 'outbound', conversation_source: 'inbound', has_lead_reply: true }),
  conv({ id: 7, direction: 'outbound', conversation_source: 'bienvenida', has_lead_reply: false }),
];
const PREVIOUS: ConvSnapshot[] = [
  conv({ id: 11, has_team_reply: true }),
  conv({ id: 12, has_team_reply: false }),
];

const input = {
  currentEvents: [] as PipelineEvent[],
  prevEvents: [] as PipelineEvent[],
  currentConvs: CURRENT,
  prevConvs: PREVIOUS,
  currentWindowFromIso: '2026-10-13T00:00:00Z',
  prevWindowFromIso: '2026-10-06T00:00:00Z',
};

describe('selectores de inbound', () => {
  it('inbound es quien escribió primero, diga lo que diga conversation_source', () => {
    expect(isInboundConv(conv({ direction: 'inbound', conversation_source: null }))).toBe(true);
    expect(isInboundConv(conv({ direction: 'outbound', conversation_source: 'inbound' }))).toBe(false);
  });

  it('atendido solo con has_team_reply explícito', () => {
    expect(hasTeamReply(conv({ has_team_reply: true }))).toBe(true);
    expect(hasTeamReply(conv({ has_team_reply: false }))).toBe(false);
    expect(hasTeamReply(conv({}))).toBe(false);
  });
});

describe('inbound_total', () => {
  it('cuenta solo las conversaciones que abrió la persona', () => {
    const r = computeWidget('inbound_total', {}, input, channelMap);
    expect(r.category).toBe('volume');
    expect(r.value.current).toBe(5);
    expect(r.value.previous).toBe(2);
  });

  it('respeta el filtro de canal', () => {
    const wa = computeWidget('inbound_total', { channel: 'wa' }, input, channelMap);
    expect(wa.value.current).toBe(1);
    const igIn = computeWidget('inbound_total', { channel: 'ig-in' }, input, channelMap);
    expect(igIn.value.current).toBe(4);
    const igOut = computeWidget('inbound_total', { channel: 'ig-out' }, input, channelMap);
    expect(igOut.value.current).toBe(0);
  });
});

describe('inbound_answered_rate', () => {
  it('de los inbound, el % que recibió respuesta de la entrenadora o de la IA', () => {
    const r = computeWidget('inbound_answered_rate', {}, input, channelMap);
    expect(r.category).toBe('rate');
    if (r.category !== 'rate') throw new Error('esperaba una tasa');
    expect(r.value.numerator).toBe(3);
    expect(r.value.denominator).toBe(5);
    expect(r.value.current).toBeCloseTo(0.6);
    expect(r.value.previous).toBeCloseTo(0.5);
  });
});

describe('drill-down de inbound', () => {
  it('inbound_total lista las mismas conversaciones que cuenta', () => {
    const m = selectWidgetMembers('inbound_total', {}, input, channelMap);
    expect(m.conversationIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(m.numeratorIds).toBeNull();
  });

  it('inbound_answered_rate: denominador = inbound, numerador = atendidos', () => {
    const m = selectWidgetMembers('inbound_answered_rate', {}, input, channelMap);
    expect(m.conversationIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect([...(m.numeratorIds ?? [])].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });
});
