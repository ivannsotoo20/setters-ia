import { describe, it, expect } from 'vitest';
import {
  classifyTab,
  tabCounts,
  applyFilters,
  rowsForTab,
  parseTab,
  parseChannel,
  parseBoolFlag,
  type ConversationListRow,
} from '../../lib/conversation-list-query';

function makeRow(overrides: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: 1,
    phase_number: 1,
    state: 'open',
    is_qualified: null,
    is_handoff_to_human: false,
    is_unread: false,
    is_blocked: false,
    assigned_user_id: null,
    ai_paused_until: null,
    last_message_at: null,
    conversation_source: 'inbound',
    leads: {
      first_name: 'Pablo',
      last_name: 'Pérez',
      username: 'pabloperez',
      external_id: 'wa:34600000000',
    },
    channels: {
      channel_type: 'whatsapp',
      via_provider: 'ycloud',
    },
    ...overrides,
  };
}

describe('classifyTab — precedence rules', () => {
  it('handoff toma precedencia sobre todo', () => {
    expect(
      classifyTab(makeRow({ is_handoff_to_human: true, phase_number: 6, state: 'closed', is_qualified: true })),
    ).toBe('hot');
  });

  it('phase 6 sin handoff → done', () => {
    expect(classifyTab(makeRow({ phase_number: 6, is_handoff_to_human: false }))).toBe('done');
  });

  it('closed + qualified + sin handoff → bought (proxy hasta Sprint Eta)', () => {
    expect(
      classifyTab(makeRow({ state: 'closed', is_qualified: true, is_handoff_to_human: false, phase_number: 5 })),
    ).toBe('bought');
  });

  it('default → chats', () => {
    expect(classifyTab(makeRow({ phase_number: 3, state: 'open', is_qualified: null, is_handoff_to_human: false }))).toBe('chats');
  });

  it('closed + NO qualified → chats (no es bought)', () => {
    expect(classifyTab(makeRow({ state: 'closed', is_qualified: false, is_handoff_to_human: false }))).toBe('chats');
  });
});

describe('tabCounts', () => {
  it('suma == total y respeta clasificación', () => {
    const rows = [
      makeRow({ id: 1, is_handoff_to_human: true }), // hot
      makeRow({ id: 2, phase_number: 6 }), // done
      makeRow({ id: 3, state: 'closed', is_qualified: true }), // bought
      makeRow({ id: 4 }), // chats
      makeRow({ id: 5 }), // chats
    ];
    const counts = tabCounts(rows);
    expect(counts).toEqual({ chats: 2, hot: 1, done: 1, bought: 1 });
    expect(counts.chats + counts.hot + counts.done + counts.bought).toBe(rows.length);
  });

  it('tabCounts vacío → todos 0', () => {
    expect(tabCounts([])).toEqual({ chats: 0, hot: 0, done: 0, bought: 0 });
  });
});

describe('applyFilters.q (búsqueda case-insensitive)', () => {
  const rows = [
    makeRow({ id: 1, leads: { first_name: 'Pablo', last_name: 'Pérez', username: 'pabloperez', external_id: 'wa:34600000001' } }),
    makeRow({ id: 2, leads: { first_name: 'Ana', last_name: 'García', username: 'anagm', external_id: 'ig:carmen22' } }),
    makeRow({ id: 3, leads: { first_name: null, last_name: null, username: 'sin_nombre', external_id: 'fb:99' } }),
  ];

  it('matchea por first_name', () => {
    const out = applyFilters(rows, { q: 'pablo' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('matchea por username case-insensitive', () => {
    const out = applyFilters(rows, { q: 'ANAGM' });
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('matchea por external_id', () => {
    const out = applyFilters(rows, { q: 'fb:99' });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it('q vacío → no filtra', () => {
    expect(applyFilters(rows, { q: '   ' }).length).toBe(3);
  });
});

describe('applyFilters.channel', () => {
  const rows = [
    makeRow({ id: 1, channels: { channel_type: 'whatsapp', via_provider: 'ycloud' } }),
    makeRow({ id: 2, channels: { channel_type: 'instagram_dm', via_provider: 'manychat' } }),
    makeRow({ id: 3, channels: { channel_type: 'facebook_messenger', via_provider: 'manychat' } }),
  ];

  it("channel='wa' deja solo whatsapp", () => {
    expect(applyFilters(rows, { channel: 'wa' }).map((r) => r.id)).toEqual([1]);
  });

  it("channel='ig' deja solo instagram_dm", () => {
    expect(applyFilters(rows, { channel: 'ig' }).map((r) => r.id)).toEqual([2]);
  });

  it("channel='all' no filtra", () => {
    expect(applyFilters(rows, { channel: 'all' }).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('applyFilters.unread / mine', () => {
  const rows = [
    makeRow({ id: 1, is_unread: true, assigned_user_id: 'me' }),
    makeRow({ id: 2, is_unread: false, assigned_user_id: 'me' }),
    makeRow({ id: 3, is_unread: true, assigned_user_id: 'someone-else' }),
    makeRow({ id: 4, is_unread: false, assigned_user_id: null }),
  ];

  it('unread=true filtra solo no leídos', () => {
    expect(applyFilters(rows, { unread: true }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('mine=true sin viewerId → vacío', () => {
    expect(applyFilters(rows, { mine: true }).length).toBe(0);
  });

  it('mine=true con viewerId filtra por assigned_user_id', () => {
    expect(applyFilters(rows, { mine: true, viewerId: 'me' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('combinación unread + mine + viewerId', () => {
    expect(
      applyFilters(rows, { unread: true, mine: true, viewerId: 'me' }).map((r) => r.id),
    ).toEqual([1]);
  });
});

describe('rowsForTab', () => {
  it('clasifica + filtra en un solo paso', () => {
    const rows = [
      makeRow({ id: 1, is_handoff_to_human: true, is_unread: true }),
      makeRow({ id: 2, is_handoff_to_human: true, is_unread: false }),
      makeRow({ id: 3, phase_number: 6 }),
    ];
    const out = rowsForTab(rows, 'hot', { unread: true });
    expect(out.map((r) => r.id)).toEqual([1]);
  });
});

describe('parseTab / parseChannel / parseBoolFlag', () => {
  it('parseTab default chats', () => {
    expect(parseTab(undefined)).toBe('chats');
    expect(parseTab(null)).toBe('chats');
    expect(parseTab('')).toBe('chats');
    expect(parseTab('weird')).toBe('chats');
    expect(parseTab('hot')).toBe('hot');
    expect(parseTab('bought')).toBe('bought');
  });

  it('parseChannel default all', () => {
    expect(parseChannel(undefined)).toBe('all');
    expect(parseChannel('xy')).toBe('all');
    expect(parseChannel('wa')).toBe('wa');
    expect(parseChannel('ig')).toBe('ig');
  });

  it('parseBoolFlag', () => {
    expect(parseBoolFlag('1')).toBe(true);
    expect(parseBoolFlag('true')).toBe(true);
    expect(parseBoolFlag('0')).toBe(false);
    expect(parseBoolFlag(null)).toBe(false);
    expect(parseBoolFlag(undefined)).toBe(false);
  });
});
