import { describe, it, expect } from 'vitest';
import {
  WIDGET_CATALOG,
  computeWidget,
  selectWidgetMembers,
  isWelcomeConv,
  isKeywordOutboundConv,
} from '../../lib/widget-catalog';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

/**
 * Métricas de outbound y drill-down (2026-09-02, petición de Tania).
 *
 * Lo que protege este fichero:
 *   1. Bienvenida y palabra clave se separan por `conversation_source`, y
 *      "respondida" es `has_lead_reply`.
 *   2. Para CADA métrica del catálogo, el número de la tarjeta y la lista del
 *      drill-down salen de la misma selección: si un día se tocara uno sin el
 *      otro, la tarjeta diría 12 y la lista traería 9.
 */

function conv(overrides: Partial<ConvSnapshot> = {}): ConvSnapshot {
  return {
    id: 1,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction: 'inbound',
    last_message_at: '2026-09-01T12:00:00Z',
    created_at: '2026-09-01T12:00:00Z',
    conversation_source: null,
    has_lead_reply: false,
    ...overrides,
  };
}

function ev(overrides: Partial<PipelineEvent>): PipelineEvent {
  return {
    event_type: 'phase_change',
    from_value: null,
    to_value: '5',
    source: 'motor',
    occurred_at: '2026-09-01T11:00:00Z',
    conversation_id: 1,
    ...overrides,
  };
}

const WINDOW_FROM = '2026-08-25T00:00:00Z';
const PREV_WINDOW_FROM = '2026-08-18T00:00:00Z';
const channelMap = new Map<number, ChannelInfo>([
  [1, { kind: 'whatsapp' }],
  [2, { kind: 'instagram_dm' }],
]);

// La foto real del tenant 7 el 2026-09-02, en pequeño: bienvenidas por WA y
// por IG, outbound por palabra clave en IG, y leads que escribieron ellos.
const FIXTURE: ConvSnapshot[] = [
  conv({ id: 1, channel_id: 1, direction: 'outbound', conversation_source: 'bienvenida', has_lead_reply: true }),
  conv({ id: 2, channel_id: 1, direction: 'outbound', conversation_source: 'bienvenida', has_lead_reply: false }),
  conv({ id: 3, channel_id: 2, direction: 'outbound', conversation_source: 'bienvenida', has_lead_reply: false }),
  conv({ id: 4, channel_id: 2, direction: 'outbound', conversation_source: 'inbound', has_lead_reply: true }),
  conv({ id: 5, channel_id: 2, direction: 'outbound', conversation_source: 'inbound', has_lead_reply: true }),
  conv({ id: 6, channel_id: 2, direction: 'outbound', conversation_source: 'inbound', has_lead_reply: false }),
  conv({ id: 7, channel_id: 2, direction: 'inbound', conversation_source: 'inbound' }),
  conv({ id: 8, channel_id: 2, direction: 'inbound', conversation_source: null }),
];

const input = {
  currentEvents: [] as PipelineEvent[],
  prevEvents: [] as PipelineEvent[],
  currentConvs: FIXTURE,
  prevConvs: [] as ConvSnapshot[],
  currentWindowFromIso: WINDOW_FROM,
  prevWindowFromIso: PREV_WINDOW_FROM,
};

describe('selectores de outbound', () => {
  it('bienvenida es por origen; palabra clave es origen inbound + dirección outbound', () => {
    expect(FIXTURE.filter(isWelcomeConv).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(FIXTURE.filter(isKeywordOutboundConv).map((c) => c.id)).toEqual([4, 5, 6]);
    // El lead que escribió él con una palabra clave NO es outbound aunque su origen sea 'inbound'.
    expect(isKeywordOutboundConv(FIXTURE[6]!)).toBe(false);
  });
});

describe('computeWidget — outbound', () => {
  it('outbound_total cuenta todo lo que abrió la entrenadora', () => {
    const r = computeWidget('outbound_total', null, input, channelMap);
    if (r.category === 'volume') expect(r.value.current).toBe(6);
  });

  it('bienvenidas: 3 enviadas, 1 respondida', () => {
    const v = computeWidget('outbound_welcome', null, input, channelMap);
    if (v.category === 'volume') expect(v.value.current).toBe(3);
    const r = computeWidget('outbound_welcome_reply_rate', null, input, channelMap);
    expect(r.category).toBe('rate');
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(1);
      expect(r.value.denominator).toBe(3);
      expect(r.value.current).toBeCloseTo(1 / 3);
    }
  });

  it('palabra clave: 3 enviados, 2 respondidos', () => {
    const v = computeWidget('outbound_keyword', null, input, channelMap);
    if (v.category === 'volume') expect(v.value.current).toBe(3);
    const r = computeWidget('outbound_keyword_reply_rate', null, input, channelMap);
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(2);
      expect(r.value.denominator).toBe(3);
    }
  });

  it('outbound_reply_rate junta las dos: 3 de 6', () => {
    const r = computeWidget('outbound_reply_rate', null, input, channelMap);
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(3);
      expect(r.value.denominator).toBe(6);
    }
  });

  it('el filtro de canal aplica: bienvenidas solo por WhatsApp', () => {
    const v = computeWidget('outbound_welcome', { channel: 'wa' }, input, channelMap);
    if (v.category === 'volume') expect(v.value.current).toBe(2);
    const r = computeWidget('outbound_welcome_reply_rate', { channel: 'wa' }, input, channelMap);
    if (r.category === 'rate') {
      expect(r.value.numerator).toBe(1);
      expect(r.value.denominator).toBe(2);
    }
  });

  it('sin has_lead_reply (snapshot sin enriquecer) nadie cuenta como respondido', () => {
    const sinFlag = FIXTURE.map((c) => ({ ...c, has_lead_reply: undefined }));
    const r = computeWidget(
      'outbound_welcome_reply_rate',
      null,
      { ...input, currentConvs: sinFlag },
      channelMap,
    );
    if (r.category === 'rate') expect(r.value.numerator).toBe(0);
  });
});

describe('selectWidgetMembers — la lista cuadra con el número en TODAS las métricas', () => {
  // Un evento por conversación para que "eventos" y "conversaciones distintas"
  // coincidan también en las métricas de outcome (ver nota en el catálogo).
  const events: PipelineEvent[] = [
    ev({ to_value: '5', conversation_id: 1 }),
    ev({ to_value: '5', conversation_id: 4 }),
    ev({ to_value: '6', conversation_id: 4 }),
    ev({ to_value: '7', conversation_id: 5 }),
    ev({ event_type: 'outcome_applied', to_value: 'bought', conversation_id: 5 }),
    ev({ event_type: 'outcome_applied', to_value: 'lost', conversation_id: 6 }),
    ev({ event_type: 'outcome_applied', to_value: 'no_show', conversation_id: 7 }),
    ev({ event_type: 'outcome_applied', to_value: 'cancelled', conversation_id: 8 }),
    ev({ event_type: 'outcome_applied', to_value: 'recontact', conversation_id: 2 }),
  ];
  const withEvents = { ...input, currentEvents: events };

  for (const def of WIDGET_CATALOG) {
    for (const filter of [null, { channel: 'ig-out' as const }, { channel: 'wa' as const }]) {
      it(`${def.key} · filtro=${filter?.channel ?? 'ninguno'}`, () => {
        const computed = computeWidget(def.key, filter, withEvents, channelMap);
        const members = selectWidgetMembers(def.key, filter, withEvents, channelMap);
        // Sin duplicados: cada persona una vez.
        expect(new Set(members.conversationIds).size).toBe(members.conversationIds.length);
        if (computed.category === 'volume') {
          expect(members.numeratorIds).toBeNull();
          expect(members.conversationIds.length).toBe(computed.value.current);
        } else {
          expect(members.conversationIds.length).toBe(computed.value.denominator);
          expect(members.numeratorIds?.size ?? 0).toBe(computed.value.numerator);
          // El numerador es un subconjunto del denominador.
          for (const id of members.numeratorIds ?? []) {
            expect(members.conversationIds).toContain(id);
          }
        }
      });
    }
  }

  it('métrica desconocida → lista vacía, no explota', () => {
    expect(selectWidgetMembers('nope', null, input, channelMap).conversationIds).toEqual([]);
  });

  it('en una tasa de respuesta, el numerador son exactamente los que contestaron', () => {
    const m = selectWidgetMembers('outbound_keyword_reply_rate', null, input, channelMap);
    expect(m.conversationIds.sort()).toEqual([4, 5, 6]);
    expect([...(m.numeratorIds ?? [])].sort()).toEqual([4, 5]);
  });
});
