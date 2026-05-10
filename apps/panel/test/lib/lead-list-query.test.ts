import { describe, it, expect } from 'vitest';
import {
  classifyLeadTabByLabels,
  leadTabCounts,
  applyFilters,
  rowsForTab,
  getLastMessageAt,
  getMaxPhase,
  getUniqueBuckets,
  getUniqueLabelIds,
  getAssignedSummary,
  isLeadAiPaused,
  isLeadBlocked,
  hasCallScheduled,
  parseLeadTab,
  parseCsvIntList,
  parseCsvStringList,
  parseQualified,
  parseAiState,
  parseTriState,
  countActiveFilters,
  type LeadListRow,
  type LeadListConv,
  type LeadListLabel,
} from '../../lib/lead-list-query';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeLabel(overrides: Partial<LeadListLabel> = {}): LeadListLabel {
  return {
    id: 1,
    name: 'Hot Lead',
    color: '#ef4444',
    destination_bucket: 'hot',
    ...overrides,
  };
}

function makeConv(overrides: Partial<LeadListConv> = {}): LeadListConv {
  return {
    id: 1,
    channel_id: 1,
    channel_type: 'instagram_dm',
    via_provider: 'manychat',
    state: 'active',
    phase_number: 2,
    is_qualified: null,
    is_handoff_to_human: false,
    is_blocked: false,
    ai_paused_until: null,
    handoff_cause: null,
    handoff_reason: null,
    handoff_at: null,
    conversation_source: 'inbound',
    call_scheduled_at: null,
    is_call_scheduling_link_sent: false,
    last_message_at: '2026-05-08T10:00:00.000Z',
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-08T10:00:00.000Z',
    assigned_user_id: null,
    labels: [],
    ...overrides,
  };
}

function makeLead(overrides: Partial<LeadListRow> = {}): LeadListRow {
  return {
    id: 1,
    first_name: 'Pablo',
    last_name: 'Pérez',
    username: 'pabloperez',
    phone: '+34600000000',
    email: 'pablo@example.com',
    location: 'Madrid',
    external_id: 'manychat:1234',
    source_channel: 'instagram',
    notes: null,
    created_at: '2026-04-15T10:00:00.000Z',
    updated_at: '2026-05-08T10:00:00.000Z',
    conversations: [makeConv()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyLeadTabByLabels
// ---------------------------------------------------------------------------

describe('classifyLeadTabByLabels — precedence rules', () => {
  it('bought toma precedencia sobre todo', () => {
    const lead = makeLead({
      conversations: [
        makeConv({
          labels: [
            makeLabel({ id: 1, destination_bucket: 'hot' }),
            makeLabel({ id: 2, destination_bucket: 'bought' }),
            makeLabel({ id: 3, destination_bucket: 'lost' }),
          ],
        }),
      ],
    });
    expect(classifyLeadTabByLabels(lead)).toBe('bought');
  });

  it('lost > cancelled > hot', () => {
    const lead = makeLead({
      conversations: [
        makeConv({
          labels: [
            makeLabel({ id: 1, destination_bucket: 'hot' }),
            makeLabel({ id: 2, destination_bucket: 'lost' }),
            makeLabel({ id: 3, destination_bucket: 'cancelled' }),
          ],
        }),
      ],
    });
    expect(classifyLeadTabByLabels(lead)).toBe('lost');
  });

  it('cancelled o no_show → cancelled tab', () => {
    const cancelled = makeLead({
      conversations: [
        makeConv({ labels: [makeLabel({ destination_bucket: 'cancelled' })] }),
      ],
    });
    const noShow = makeLead({
      conversations: [makeConv({ labels: [makeLabel({ destination_bucket: 'no_show' })] })],
    });
    expect(classifyLeadTabByLabels(cancelled)).toBe('cancelled');
    expect(classifyLeadTabByLabels(noShow)).toBe('cancelled');
  });

  it('hot label sin terminales → hot', () => {
    const lead = makeLead({
      conversations: [makeConv({ labels: [makeLabel({ destination_bucket: 'hot' })] })],
    });
    expect(classifyLeadTabByLabels(lead)).toBe('hot');
  });

  it('sin labels y conv state=active → active', () => {
    expect(classifyLeadTabByLabels(makeLead())).toBe('active');
  });

  it('sin labels y sin conv active → all', () => {
    const lead = makeLead({
      conversations: [makeConv({ state: 'closed', labels: [] })],
    });
    expect(classifyLeadTabByLabels(lead)).toBe('all');
  });

  it('lead sin conversations → all', () => {
    expect(classifyLeadTabByLabels(makeLead({ conversations: [] }))).toBe('all');
  });
});

// ---------------------------------------------------------------------------
// leadTabCounts
// ---------------------------------------------------------------------------

describe('leadTabCounts', () => {
  it('all = total, otros = clasificados', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ labels: [makeLabel({ destination_bucket: 'bought' })] })] }),
      makeLead({ id: 2, conversations: [makeConv({ labels: [makeLabel({ destination_bucket: 'hot' })] })] }),
      makeLead({ id: 3 }), // active
      makeLead({ id: 4, conversations: [makeConv({ state: 'closed', labels: [] })] }), // all (no clasificable)
      makeLead({ id: 5, conversations: [makeConv({ labels: [makeLabel({ destination_bucket: 'lost' })] })] }),
    ];
    const counts = leadTabCounts(rows);
    expect(counts.all).toBe(5);
    expect(counts.bought).toBe(1);
    expect(counts.hot).toBe(1);
    expect(counts.active).toBe(1);
    expect(counts.lost).toBe(1);
    expect(counts.cancelled).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

describe('derived helpers', () => {
  it('getLastMessageAt devuelve el MAX', () => {
    const lead = makeLead({
      conversations: [
        makeConv({ id: 1, last_message_at: '2026-05-01T00:00:00.000Z' }),
        makeConv({ id: 2, last_message_at: '2026-05-09T00:00:00.000Z' }),
        makeConv({ id: 3, last_message_at: null }),
      ],
    });
    expect(getLastMessageAt(lead)).toBe('2026-05-09T00:00:00.000Z');
  });

  it('getLastMessageAt devuelve null si todas son null', () => {
    const lead = makeLead({
      conversations: [makeConv({ last_message_at: null }), makeConv({ id: 2, last_message_at: null })],
    });
    expect(getLastMessageAt(lead)).toBeNull();
  });

  it('getMaxPhase devuelve el mayor', () => {
    const lead = makeLead({
      conversations: [makeConv({ phase_number: 1 }), makeConv({ id: 2, phase_number: 5 })],
    });
    expect(getMaxPhase(lead)).toBe(5);
  });

  it('getUniqueBuckets dedupea correctamente', () => {
    const lead = makeLead({
      conversations: [
        makeConv({
          labels: [
            makeLabel({ id: 1, destination_bucket: 'hot' }),
            makeLabel({ id: 2, destination_bucket: 'hot' }),
          ],
        }),
        makeConv({
          id: 2,
          labels: [makeLabel({ id: 3, destination_bucket: 'bought' })],
        }),
      ],
    });
    expect(getUniqueBuckets(lead).sort()).toEqual(['bought', 'hot']);
  });

  it('getUniqueLabelIds dedupea ids', () => {
    const lead = makeLead({
      conversations: [
        makeConv({ labels: [makeLabel({ id: 1 }), makeLabel({ id: 2 })] }),
        makeConv({ id: 2, labels: [makeLabel({ id: 1 })] }),
      ],
    });
    expect(getUniqueLabelIds(lead).sort()).toEqual([1, 2]);
  });

  it('getAssignedSummary detecta unassigned/single/multiple', () => {
    expect(getAssignedSummary(makeLead()).display).toBe('unassigned');
    expect(
      getAssignedSummary(
        makeLead({ conversations: [makeConv({ assigned_user_id: 'u1' })] }),
      ).display,
    ).toBe('single');
    expect(
      getAssignedSummary(
        makeLead({
          conversations: [
            makeConv({ assigned_user_id: 'u1' }),
            makeConv({ id: 2, assigned_user_id: 'u2' }),
          ],
        }),
      ).display,
    ).toBe('multiple');
  });

  it('isLeadAiPaused detecta handoff y ai_paused_until futuro', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(isLeadAiPaused(makeLead())).toBe(false);
    expect(
      isLeadAiPaused(makeLead({ conversations: [makeConv({ is_handoff_to_human: true })] })),
    ).toBe(true);
    expect(
      isLeadAiPaused(makeLead({ conversations: [makeConv({ ai_paused_until: future })] })),
    ).toBe(true);
    expect(
      isLeadAiPaused(makeLead({ conversations: [makeConv({ ai_paused_until: past })] })),
    ).toBe(false);
    expect(
      isLeadAiPaused(makeLead({ conversations: [makeConv({ ai_paused_until: 'infinity' })] })),
    ).toBe(true);
  });

  it('isLeadBlocked y hasCallScheduled', () => {
    expect(isLeadBlocked(makeLead())).toBe(false);
    expect(
      isLeadBlocked(makeLead({ conversations: [makeConv({ is_blocked: true })] })),
    ).toBe(true);

    expect(hasCallScheduled(makeLead())).toBe(false);
    expect(
      hasCallScheduled(
        makeLead({
          conversations: [makeConv({ call_scheduled_at: '2026-06-01T10:00:00.000Z' })],
        }),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('applyFilters — búsqueda libre', () => {
  it('matchea por first_name CI', () => {
    const rows = [
      makeLead({ first_name: 'Pablo', username: 'pabloperez' }),
      makeLead({
        id: 2,
        first_name: 'Marta',
        last_name: 'García',
        username: 'martag',
        phone: '+34611111111',
        email: 'marta@otro.com',
        external_id: 'manychat:9999',
      }),
    ];
    const out = applyFilters(rows, { q: 'pab' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('matchea por phone', () => {
    const rows = [
      makeLead({ phone: '+34600000000', username: 'pa', email: 'a@a.com' }),
      makeLead({
        id: 2,
        phone: '+34611111111',
        username: 'pb',
        email: 'b@b.com',
        external_id: 'manychat:b',
      }),
    ];
    expect(applyFilters(rows, { q: '600000000' }).map((r) => r.id)).toEqual([1]);
  });

  it('matchea por email parcial', () => {
    const rows = [
      makeLead({ email: 'a@example.com', username: 'a', phone: '+1', external_id: 'a' }),
      makeLead({
        id: 2,
        email: 'b@otra.com',
        username: 'b',
        phone: '+2',
        external_id: 'b',
      }),
    ];
    expect(applyFilters(rows, { q: 'example' }).map((r) => r.id)).toEqual([1]);
  });

  it('matchea por external_id', () => {
    const rows = [
      makeLead({ external_id: 'manychat:1234', username: 'x', phone: '+9', email: 'x@x.com' }),
      makeLead({ id: 2, external_id: 'manychat:5678', username: 'y', phone: '+8', email: 'y@y.com' }),
    ];
    expect(applyFilters(rows, { q: '1234' }).map((r) => r.id)).toEqual([1]);
  });

  it('q vacío no filtra', () => {
    const rows = [makeLead(), makeLead({ id: 2 })];
    expect(applyFilters(rows, { q: '' })).toHaveLength(2);
  });
});

describe('applyFilters — channel/provider/triggers', () => {
  it('channels filtra por canal del conv', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ channel_type: 'whatsapp' })] }),
      makeLead({ id: 2, conversations: [makeConv({ channel_type: 'instagram_dm' })] }),
      makeLead({ id: 3, conversations: [makeConv({ channel_type: 'facebook_messenger' })] }),
    ];
    expect(applyFilters(rows, { channels: ['wa'] }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { channels: ['wa', 'fb'] }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('providers filtra por via_provider', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ via_provider: 'manychat' })] }),
      makeLead({ id: 2, conversations: [makeConv({ via_provider: 'ycloud' })] }),
    ];
    expect(applyFilters(rows, { providers: ['ycloud'] }).map((r) => r.id)).toEqual([2]);
  });

  it('triggers filtra por conversation_source', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ conversation_source: 'BIENVENIDA' })] }),
      makeLead({ id: 2, conversations: [makeConv({ conversation_source: 'organic' })] }),
    ];
    expect(applyFilters(rows, { triggers: ['BIENVENIDA'] }).map((r) => r.id)).toEqual([1]);
  });
});

describe('applyFilters — pipeline', () => {
  it('phases multi', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ phase_number: 1 })] }),
      makeLead({ id: 2, conversations: [makeConv({ phase_number: 5 })] }),
      makeLead({ id: 3, conversations: [makeConv({ phase_number: 7 })] }),
    ];
    expect(applyFilters(rows, { phases: [5, 7] }).map((r) => r.id)).toEqual([2, 3]);
  });

  it('states multi', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ state: 'active' })] }),
      makeLead({ id: 2, conversations: [makeConv({ state: 'closed' })] }),
    ];
    expect(applyFilters(rows, { states: ['closed'] }).map((r) => r.id)).toEqual([2]);
  });

  it('qualified yes/no/undecided', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ is_qualified: true })] }),
      makeLead({ id: 2, conversations: [makeConv({ is_qualified: false })] }),
      makeLead({ id: 3, conversations: [makeConv({ is_qualified: null })] }),
    ];
    expect(applyFilters(rows, { qualified: 'yes' }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { qualified: 'no' }).map((r) => r.id)).toEqual([2]);
    expect(applyFilters(rows, { qualified: 'undecided' }).map((r) => r.id)).toEqual([3]);
    expect(applyFilters(rows, { qualified: 'all' }).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('handoffCauses multi', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ handoff_cause: 'A_agenda' })] }),
      makeLead({ id: 2, conversations: [makeConv({ handoff_cause: 'B_derivacion' })] }),
      makeLead({ id: 3, conversations: [makeConv({ handoff_cause: null })] }),
    ];
    expect(applyFilters(rows, { handoffCauses: ['A_agenda'] }).map((r) => r.id)).toEqual([1]);
  });
});

describe('applyFilters — labels y asignación', () => {
  it('labelIds match si lead tiene al menos una', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ labels: [makeLabel({ id: 5 })] })] }),
      makeLead({ id: 2, conversations: [makeConv({ labels: [makeLabel({ id: 7 })] })] }),
    ];
    expect(applyFilters(rows, { labelIds: [5] }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { labelIds: [5, 7] }).map((r) => r.id)).toEqual([1, 2]);
    expect(applyFilters(rows, { labelIds: [99] }).map((r) => r.id)).toEqual([]);
  });

  it('assignee mine requiere viewerId match', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ assigned_user_id: 'u1' })] }),
      makeLead({ id: 2, conversations: [makeConv({ assigned_user_id: 'u2' })] }),
      makeLead({ id: 3 }),
    ];
    expect(
      applyFilters(rows, { assignee: 'mine', viewerId: 'u1' }).map((r) => r.id),
    ).toEqual([1]);
    expect(applyFilters(rows, { assignee: 'mine', viewerId: null }).map((r) => r.id)).toEqual([]);
  });

  it('assignee unassigned filtra solo los sin asignar', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ assigned_user_id: 'u1' })] }),
      makeLead({ id: 2 }),
    ];
    expect(applyFilters(rows, { assignee: 'unassigned' }).map((r) => r.id)).toEqual([2]);
  });

  it('assignee userId filtra exacto', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ assigned_user_id: 'u1' })] }),
      makeLead({ id: 2, conversations: [makeConv({ assigned_user_id: 'u2' })] }),
    ];
    expect(applyFilters(rows, { assignee: 'u2' }).map((r) => r.id)).toEqual([2]);
  });
});

describe('applyFilters — fechas', () => {
  it('createdFrom/createdTo filtra rango lead.created_at', () => {
    const rows = [
      makeLead({ id: 1, created_at: '2026-04-01T00:00:00.000Z' }),
      makeLead({ id: 2, created_at: '2026-04-15T00:00:00.000Z' }),
      makeLead({ id: 3, created_at: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(
      applyFilters(rows, {
        createdFrom: '2026-04-10T00:00:00.000Z',
        createdTo: '2026-04-20T00:00:00.000Z',
      }).map((r) => r.id),
    ).toEqual([2]);
  });

  it('lastMsgFrom/lastMsgTo filtra rango MAX(conv.last_message_at)', () => {
    const rows = [
      makeLead({
        id: 1,
        conversations: [makeConv({ last_message_at: '2026-04-01T00:00:00.000Z' })],
      }),
      makeLead({
        id: 2,
        conversations: [makeConv({ last_message_at: '2026-05-08T00:00:00.000Z' })],
      }),
    ];
    expect(
      applyFilters(rows, { lastMsgFrom: '2026-05-01T00:00:00.000Z' }).map((r) => r.id),
    ).toEqual([2]);
  });

  it('lastMsgNever filtra leads SIN ningún last_message_at', () => {
    const rows = [
      makeLead({
        id: 1,
        conversations: [makeConv({ last_message_at: '2026-05-01T00:00:00.000Z' })],
      }),
      makeLead({ id: 2, conversations: [makeConv({ last_message_at: null })] }),
    ];
    expect(applyFilters(rows, { lastMsgNever: true }).map((r) => r.id)).toEqual([2]);
  });
});

describe('applyFilters — estado IA / bloqueado / scheduled', () => {
  it('aiState paused / active', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ is_handoff_to_human: true })] }),
      makeLead({ id: 2 }),
    ];
    expect(applyFilters(rows, { aiState: 'paused' }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { aiState: 'active' }).map((r) => r.id)).toEqual([2]);
  });

  it('blocked yes/no', () => {
    const rows = [
      makeLead({ id: 1, conversations: [makeConv({ is_blocked: true })] }),
      makeLead({ id: 2 }),
    ];
    expect(applyFilters(rows, { blocked: 'yes' }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { blocked: 'no' }).map((r) => r.id)).toEqual([2]);
  });

  it('scheduled yes/no', () => {
    const rows = [
      makeLead({
        id: 1,
        conversations: [makeConv({ call_scheduled_at: '2026-06-01T10:00:00.000Z' })],
      }),
      makeLead({ id: 2 }),
    ];
    expect(applyFilters(rows, { scheduled: 'yes' }).map((r) => r.id)).toEqual([1]);
    expect(applyFilters(rows, { scheduled: 'no' }).map((r) => r.id)).toEqual([2]);
  });
});

describe('applyFilters — combinaciones', () => {
  it('q + channels + tab simulado vía rowsForTab', () => {
    const rows = [
      makeLead({
        id: 1,
        first_name: 'Iván',
        conversations: [
          makeConv({
            channel_type: 'whatsapp',
            labels: [makeLabel({ destination_bucket: 'bought' })],
          }),
        ],
      }),
      makeLead({
        id: 2,
        first_name: 'Iván',
        conversations: [
          makeConv({ channel_type: 'instagram_dm', labels: [makeLabel({ destination_bucket: 'hot' })] }),
        ],
      }),
      makeLead({ id: 3, first_name: 'Otro', conversations: [makeConv({ channel_type: 'whatsapp' })] }),
    ];
    expect(rowsForTab(rows, 'bought', { q: 'Iv', channels: ['wa'] }).map((r) => r.id)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// URL parsers
// ---------------------------------------------------------------------------

describe('URL parsers', () => {
  it('parseLeadTab valida valores', () => {
    expect(parseLeadTab('bought')).toBe('bought');
    expect(parseLeadTab('lost')).toBe('lost');
    expect(parseLeadTab('cancelled')).toBe('cancelled');
    expect(parseLeadTab(undefined)).toBe('all');
    expect(parseLeadTab('garbage')).toBe('all');
  });

  it('parseCsvIntList', () => {
    expect(parseCsvIntList('1,2,3')).toEqual([1, 2, 3]);
    expect(parseCsvIntList('1, abc, 3')).toEqual([1, 3]);
    expect(parseCsvIntList('')).toEqual([]);
    expect(parseCsvIntList(null)).toEqual([]);
  });

  it('parseCsvStringList', () => {
    expect(parseCsvStringList('wa,ig,fb')).toEqual(['wa', 'ig', 'fb']);
    expect(parseCsvStringList(' a , b ,c')).toEqual(['a', 'b', 'c']);
    expect(parseCsvStringList(undefined)).toEqual([]);
  });

  it('parseQualified', () => {
    expect(parseQualified('yes')).toBe('yes');
    expect(parseQualified('no')).toBe('no');
    expect(parseQualified('undecided')).toBe('undecided');
    expect(parseQualified('garbage')).toBe('all');
  });

  it('parseAiState', () => {
    expect(parseAiState('paused')).toBe('paused');
    expect(parseAiState('active')).toBe('active');
    expect(parseAiState(null)).toBe('all');
  });

  it('parseTriState', () => {
    expect(parseTriState('yes')).toBe('yes');
    expect(parseTriState('no')).toBe('no');
    expect(parseTriState('garbage')).toBe('all');
  });
});

// ---------------------------------------------------------------------------
// countActiveFilters
// ---------------------------------------------------------------------------

describe('countActiveFilters', () => {
  it('cuenta cada grupo activo como 1', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(
      countActiveFilters({
        q: 'pab',
        channels: ['wa'],
        labelIds: [1, 2],
        qualified: 'yes',
      }),
    ).toBe(4);
  });

  it('rangos de fecha cuentan como 1', () => {
    expect(
      countActiveFilters({
        createdFrom: '2026-01-01T00:00:00.000Z',
        createdTo: '2026-12-31T00:00:00.000Z',
      }),
    ).toBe(1);
    expect(countActiveFilters({ lastMsgNever: true })).toBe(1);
  });
});
