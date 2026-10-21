import { describe, it, expect } from 'vitest';
import { computeAlerts } from '../../lib/dashboard-alerts';
import {
  applyFilters,
  parseAlertFilter,
  parseConversationIds,
  MAX_FILTER_IDS,
  type ConversationListRow,
} from '../../lib/conversation-list-query';
import type { KpiSnapshot } from '../../lib/dashboard-metrics';
import type { WaitingResult } from '../../lib/dashboard-query';

/**
 * Alertas que se abren (2026-10-21, Tania): "veo 11 personas esperando respuesta
 * y 58 conversaciones en mis manos desde hace más de 24 h, pero al pulsar en las
 * alertas no me da acceso". La alerta lleva sus conversaciones y la lista de
 * /conversations se filtra por ellas.
 */

function emptyKpis(): KpiSnapshot {
  const v = { current: 0, previous: 0, deltaPct: null, deltaSign: 'flat' as const, hasInsufficientData: true };
  const r = { ...v, numerator: 0, denominator: 0 };
  return { leads: v, active: v, qualified: v, linkSent: v, scheduled: v, won: v, showRate: r, closeRate: r };
}

const none: WaitingResult = { count: 0, hoursWaitingMax: 0, convIds: [] };

function alerts(awaitingReply: WaitingResult, unattendedHandoffs: WaitingResult) {
  return computeAlerts({
    kpis: emptyKpis(),
    stalls: [],
    awaitingReply,
    unattendedHandoffs,
    closeRateBaseline: null,
    noShowCurrentCount: 0,
    noShowWindowDays: 7,
    historicEvents: [],
  });
}

function row(id: number): ConversationListRow {
  return {
    id,
    phase_number: 2,
    state: 'open',
    is_qualified: null,
    is_handoff_to_human: false,
    is_unread: false,
    is_blocked: false,
    assigned_user_id: null,
    ai_paused_until: null,
    last_message_at: null,
    conversation_source: 'inbound',
    leads: { first_name: 'Ana', last_name: 'Ruiz', username: 'anaruiz', external_id: 'ig:1' },
    channels: { channel_type: 'instagram', via_provider: 'ghl' },
  } as unknown as ConversationListRow;
}

describe('alertas con sus conversaciones', () => {
  it('esperando respuesta y en sus manos llevan las conversaciones que cuentan', () => {
    const out = alerts(
      { count: 2, hoursWaitingMax: 5, convIds: [11, 12] },
      { count: 1, hoursWaitingMax: 30, convIds: [21] },
    );
    expect(out.find((a) => a.type === 'awaiting_reply')!.convIds).toEqual([11, 12]);
    expect(out.find((a) => a.type === 'handoff_unattended')!.convIds).toEqual([21]);
  });

  it('sin conversaciones, no hay alerta', () => {
    expect(alerts(none, none)).toHaveLength(0);
  });
});

describe('filtro de conversaciones por ids', () => {
  it('lee los ids de la URL, sin repetidos ni basura, con tope', () => {
    expect(parseConversationIds('3,1,3,x,-2,0, 7')).toEqual([3, 1, 7]);
    expect(parseConversationIds(undefined)).toEqual([]);
    const many = Array.from({ length: MAX_FILTER_IDS + 50 }, (_, i) => i + 1).join(',');
    expect(parseConversationIds(many)).toHaveLength(MAX_FILTER_IDS);
  });

  it('solo reconoce las alertas que abren lista', () => {
    expect(parseAlertFilter('awaiting_reply')).toBe('awaiting_reply');
    expect(parseAlertFilter('handoff_unattended')).toBe('handoff_unattended');
    expect(parseAlertFilter('bottleneck')).toBeNull();
    expect(parseAlertFilter(undefined)).toBeNull();
  });

  it('con ids, la lista se queda solo con esas conversaciones; sin ids, todas', () => {
    const rows = [row(1), row(2), row(3)];
    expect(applyFilters(rows, { ids: [3, 1] }).map((r) => r.id)).toEqual([1, 3]);
    expect(applyFilters(rows, { ids: [] }).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(applyFilters(rows, {}).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
