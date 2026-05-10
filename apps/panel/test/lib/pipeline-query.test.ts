import { describe, it, expect } from 'vitest';
import {
  classifyCardColumn,
  applyPipelineFilters,
  groupCardsByColumn,
  cardsForColumn,
  columnCounts,
  parseDateRange,
  defaultDateRange,
  type PipelineCard,
} from '../../lib/pipeline-query';
import { pipelineKeyToFilter, isOutcomeColumn, isPhaseColumn } from '../../lib/pipeline-constants';

function card(overrides: Partial<PipelineCard> = {}): PipelineCard {
  return {
    id: 1,
    tenantId: 5,
    phaseNumber: 1,
    state: 'active',
    isQualified: null,
    isHandoffToHuman: null,
    aiPausedUntil: null,
    assignedUserId: null,
    direction: 'inbound',
    conversationSource: null,
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
    lead: { first_name: null, last_name: null, username: null, external_id: 'ext1' },
    channel: { channel_type: 'whatsapp', via_provider: 'manychat' },
    labels: [],
    ...overrides,
  };
}

describe('pipelineKeyToFilter', () => {
  it('wa → channel_type whatsapp sin direction', () => {
    expect(pipelineKeyToFilter('wa')).toEqual({ channelType: 'whatsapp' });
  });
  it('fb → facebook_messenger', () => {
    expect(pipelineKeyToFilter('fb')).toEqual({ channelType: 'facebook_messenger' });
  });
  it('ig-in → instagram_dm + inbound', () => {
    expect(pipelineKeyToFilter('ig-in')).toEqual({
      channelType: 'instagram_dm',
      direction: 'inbound',
    });
  });
  it('ig-out → instagram_dm + outbound', () => {
    expect(pipelineKeyToFilter('ig-out')).toEqual({
      channelType: 'instagram_dm',
      direction: 'outbound',
    });
  });
});

describe('classifyCardColumn', () => {
  it('phase 1 sin labels → f1', () => {
    expect(classifyCardColumn(card({ phaseNumber: 1 }))).toBe('f1');
  });
  it('phase 5 sin labels → f5', () => {
    expect(classifyCardColumn(card({ phaseNumber: 5 }))).toBe('f5');
  });
  it('phase 7 sin labels → f7', () => {
    expect(classifyCardColumn(card({ phaseNumber: 7 }))).toBe('f7');
  });
  it('phase 0 (default) → f1', () => {
    expect(classifyCardColumn(card({ phaseNumber: 0 }))).toBe('f1');
  });
  it('outcome label override > phase_number', () => {
    const c = card({
      phaseNumber: 4,
      labels: [
        {
          id: 1,
          name: 'Cita cancelada',
          color: '#f59e0b',
          destinationBucket: 'cancelled',
          isSystem: true,
        },
      ],
    });
    expect(classifyCardColumn(c)).toBe('cancelled');
  });
  it('precedencia outcomes: bought > lost > no_show > cancelled > recontact', () => {
    const c = card({
      phaseNumber: 1,
      labels: [
        { id: 1, name: 'Cancelada', color: '#000', destinationBucket: 'cancelled', isSystem: true },
        { id: 2, name: 'Comprado', color: '#000', destinationBucket: 'bought', isSystem: true },
        { id: 3, name: 'Recontacto', color: '#000', destinationBucket: 'recontact', isSystem: true },
      ],
    });
    expect(classifyCardColumn(c)).toBe('bought');
  });
  it('label sin bucket outcome no afecta', () => {
    const c = card({
      phaseNumber: 3,
      labels: [
        { id: 1, name: 'Hot Lead', color: '#000', destinationBucket: 'hot', isSystem: true },
      ],
    });
    expect(classifyCardColumn(c)).toBe('f3');
  });
});

describe('applyPipelineFilters', () => {
  const c1 = card({ id: 1, lead: { first_name: 'Pablo', last_name: null, username: null, external_id: 'a1' } });
  const c2 = card({ id: 2, assignedUserId: 'user-x', lead: { first_name: 'María', last_name: null, username: null, external_id: 'a2' } });
  const c3 = card({ id: 3, assignedUserId: null, lead: { first_name: 'Juan', last_name: null, username: null, external_id: 'a3' } });
  const cards = [c1, c2, c3];

  it('q matchea por nombre case-insensitive', () => {
    expect(applyPipelineFilters(cards, { q: 'pablo' })).toHaveLength(1);
    expect(applyPipelineFilters(cards, { q: 'PABLO' })).toHaveLength(1);
  });
  it('assignee=me filtra por viewerId', () => {
    expect(applyPipelineFilters(cards, { assignee: 'me', viewerId: 'user-x' })).toHaveLength(1);
  });
  it('assignee=me sin viewerId → 0', () => {
    expect(applyPipelineFilters(cards, { assignee: 'me', viewerId: null })).toHaveLength(0);
  });
  it('assignee=unassigned → solo nulls', () => {
    expect(applyPipelineFilters(cards, { assignee: 'unassigned' })).toHaveLength(2);
  });
  it('labelIds match al menos uno', () => {
    const c = card({
      id: 4,
      labels: [{ id: 99, name: 'X', color: '#000', destinationBucket: null, isSystem: false }],
    });
    expect(applyPipelineFilters([c1, c], { labelIds: [99] })).toHaveLength(1);
    expect(applyPipelineFilters([c1, c], { labelIds: [100] })).toHaveLength(0);
  });
});

describe('groupCardsByColumn + columnCounts', () => {
  it('reparte cards por columna y suma cuadra', () => {
    const cards = [
      card({ id: 1, phaseNumber: 1 }),
      card({ id: 2, phaseNumber: 1 }),
      card({ id: 3, phaseNumber: 5 }),
      card({
        id: 4,
        phaseNumber: 6,
        labels: [
          { id: 1, name: 'Comprado', color: '#000', destinationBucket: 'bought', isSystem: true },
        ],
      }),
    ];
    const grouped = groupCardsByColumn(cards);
    expect(grouped.f1).toHaveLength(2);
    expect(grouped.f5).toHaveLength(1);
    expect(grouped.bought).toHaveLength(1);
    expect(grouped.f6).toHaveLength(0);
    const counts = columnCounts(cards);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(cards.length);
  });
});

describe('cardsForColumn', () => {
  it('devuelve solo cards de la columna pedida', () => {
    const cards = [
      card({ id: 1, phaseNumber: 2 }),
      card({ id: 2, phaseNumber: 3 }),
      card({ id: 3, phaseNumber: 2 }),
    ];
    expect(cardsForColumn(cards, 'f2')).toHaveLength(2);
    expect(cardsForColumn(cards, 'f3')).toHaveLength(1);
    expect(cardsForColumn(cards, 'f7')).toHaveLength(0);
  });
});

describe('parseDateRange / defaultDateRange', () => {
  it('default = últimos 30 días', () => {
    const now = new Date('2026-05-09T12:00:00Z');
    const r = defaultDateRange(now);
    const fromDate = new Date(r.from);
    const toDate = new Date(r.to);
    const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
    expect(diffDays).toBe(30);
  });
  it('parse con valores válidos preserva', () => {
    const r = parseDateRange('2026-04-01T00:00:00Z', '2026-04-30T23:59:00Z');
    expect(new Date(r.from).getTime()).toBe(Date.parse('2026-04-01T00:00:00Z'));
  });
  it('parse con valor inválido cae a default', () => {
    const r = parseDateRange('garbage', null);
    expect(r.from).not.toBe('garbage');
  });
});

describe('isOutcomeColumn / isPhaseColumn helpers', () => {
  it('cancelled = outcome', () => {
    expect(isOutcomeColumn('cancelled')).toBe(true);
    expect(isOutcomeColumn('f3')).toBe(false);
  });
  it('f1-f7 = phase', () => {
    expect(isPhaseColumn('f3')).toBe(true);
    expect(isPhaseColumn('bought')).toBe(false);
  });
});
