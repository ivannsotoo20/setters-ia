import { describe, it, expect } from 'vitest';
import {
  classifyChannel,
  aggregateMatrix,
  detectAwaitingReply,
  detectStalls,
  detectUnattendedHandoffs,
  isTestLeadName,
  ALL_CHANNEL_KEYS,
  ALL_MATRIX_COLUMNS,
  type ChannelInfo,
  type LastMessageInfo,
  type MessageSource,
} from '../../lib/dashboard-query';
import type { PipelineEvent } from '../../lib/pipeline-metrics';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';

function conv(overrides: Partial<ConvSnapshot> = {}): ConvSnapshot {
  return {
    id: 1,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction: 'inbound',
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function ev(overrides: Partial<PipelineEvent>): PipelineEvent {
  return {
    event_type: 'phase_change',
    from_value: null,
    to_value: '5',
    source: 'motor',
    occurred_at: new Date().toISOString(),
    conversation_id: 1,
    ...overrides,
  };
}

describe('classifyChannel', () => {
  it('whatsapp → wa', () => {
    expect(classifyChannel({ kind: 'whatsapp' }, 'inbound')).toBe('wa');
    expect(classifyChannel({ kind: 'whatsapp' }, 'outbound')).toBe('wa');
  });
  it('facebook_messenger → fb', () => {
    expect(classifyChannel({ kind: 'facebook_messenger' }, 'inbound')).toBe('fb');
  });
  it('instagram_dm + inbound → ig-in', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'inbound')).toBe('ig-in');
  });
  it('instagram_dm + outbound → ig-out', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'outbound')).toBe('ig-out');
  });
  it('instagram_dm + untagged → null', () => {
    expect(classifyChannel({ kind: 'instagram_dm' }, 'untagged')).toBeNull();
  });
  it('undefined channel → null', () => {
    expect(classifyChannel(undefined, 'inbound')).toBeNull();
  });
});

describe('aggregateMatrix — estructura', () => {
  it('5 rows en orden Leads/Activas/Cualificados/Agendados/Ganados', () => {
    const m = aggregateMatrix({
      events: [],
      convs: [],
      prevEvents: [],
      prevConvs: [],
      channelMap: new Map(),
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows.map((r) => r.key)).toEqual([
      'leads',
      'active',
      'qualified',
      'scheduled',
      'won',
    ]);
  });

  it('cada row tiene las 5 columnas (4 canales + total)', () => {
    const m = aggregateMatrix({
      events: [],
      convs: [],
      prevEvents: [],
      prevConvs: [],
      channelMap: new Map(),
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    for (const row of m.rows) {
      for (const col of ALL_MATRIX_COLUMNS) {
        expect(row.cells[col]).toBeDefined();
        expect(row.cells[col].count).toBe(0);
      }
    }
  });
});

describe('aggregateMatrix — leads', () => {
  it('reparte leads por canal y suma total', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
      [3, { kind: 'instagram_dm' }],
    ]);
    const convs = [
      conv({ id: 1, channel_id: 1, direction: 'inbound' }),
      conv({ id: 2, channel_id: 1, direction: 'outbound' }),
      conv({ id: 3, channel_id: 2, direction: 'inbound' }),
      conv({ id: 4, channel_id: 3, direction: 'inbound' }),
      conv({ id: 5, channel_id: 3, direction: 'outbound' }),
    ];
    const m = aggregateMatrix({
      events: [],
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const leads = m.rows[0]!;
    expect(leads.cells.wa.count).toBe(2);
    expect(leads.cells.fb.count).toBe(1);
    expect(leads.cells['ig-in'].count).toBe(1);
    expect(leads.cells['ig-out'].count).toBe(1);
    expect(leads.cells.total.count).toBe(5);
  });
});

describe('aggregateMatrix — heatmap intensity', () => {
  it('intensidad max=1 para canal con max count', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'facebook_messenger' }],
    ]);
    // 4 leads WA, 1 lead FB
    const convs = [
      conv({ id: 1, channel_id: 1 }),
      conv({ id: 2, channel_id: 1 }),
      conv({ id: 3, channel_id: 1 }),
      conv({ id: 4, channel_id: 1 }),
      conv({ id: 5, channel_id: 2 }),
    ];
    const m = aggregateMatrix({
      events: [],
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const leads = m.rows[0]!;
    expect(leads.cells.wa.intensity).toBe(1);
    expect(leads.cells.fb.intensity).toBe(0.25);
    // total nunca tiene intensity (muted)
    expect(leads.cells.total.intensity).toBe(0);
  });
});

describe('aggregateMatrix — deltaPct', () => {
  it('null si prev=0', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const m = aggregateMatrix({
      events: [],
      convs: [conv({ id: 1, channel_id: 1 })],
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows[0]!.cells.wa.deltaPct).toBeNull();
  });

  it('calcula correctamente', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const cur = [conv({ id: 1, channel_id: 1 }), conv({ id: 2, channel_id: 1 })];
    const prev = [conv({ id: 100, channel_id: 1 })];
    const m = aggregateMatrix({
      events: [],
      convs: cur,
      prevEvents: [],
      prevConvs: prev,
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    expect(m.rows[0]!.cells.wa.deltaPct).toBeCloseTo(1); // +100%
  });
});

describe('aggregateMatrix — qualified row', () => {
  it('cuenta phase_change to=5 por canal correcto', () => {
    const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
    const convs = [conv({ id: 10, channel_id: 1 }), conv({ id: 11, channel_id: 1 })];
    const events: PipelineEvent[] = [
      ev({ to_value: '5', conversation_id: 10 }),
      ev({ to_value: '5', conversation_id: 11 }),
    ];
    const m = aggregateMatrix({
      events,
      convs,
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
    });
    const qualified = m.rows.find((r) => r.key === 'qualified')!;
    expect(qualified.cells.wa.count).toBe(2);
  });
});

function lastMsg(
  source: MessageSource,
  sentAt: string,
  lastHumanAt: string | null = null,
): LastMessageInfo {
  return { source, sentAt, lastHumanAt };
}

/** Mismo último mensaje para todas las conversaciones dadas. */
function sameLast(
  convs: ConvSnapshot[],
  source: MessageSource,
  sentAt: string,
): Map<number, LastMessageInfo> {
  return new Map(convs.map((c): [number, LastMessageInfo] => [c.id, lastMsg(source, sentAt)]));
}

describe('isTestLeadName', () => {
  it('Ivan, Iván, ivan, IVÁN → conversación de prueba', () => {
    for (const n of ['Ivan', 'Iván', 'ivan', 'IVÁN', ' Iván ']) {
      expect(isTestLeadName(n)).toBe(true);
    }
  });

  it('otros nombres, vacío o null → no', () => {
    for (const n of ['Ivana', 'Iván Soto', 'Tania', '', null, undefined]) {
      expect(isTestLeadName(n)).toBe(false);
    }
  });
});

describe('detectStalls — sin respuesta de la persona', () => {
  const channelMap = new Map<number, ChannelInfo>([[1, { kind: 'whatsapp' }]]);
  const now = new Date('2026-09-03T12:00:00Z');
  const fourDaysAgo = '2026-08-30T12:00:00Z';
  const twoDaysAgo = '2026-09-01T12:00:00Z';

  function activeConvs(n: number, phase = 2): ConvSnapshot[] {
    return Array.from({ length: n }, (_, i) =>
      conv({
        id: i + 1,
        channel_id: 1,
        phase_number: phase,
        ai_paused_until: null,
        is_handoff_to_human: false,
      }),
    );
  }

  it('F2 con último mensaje de la IA hace 4 días → grupo wa:2', () => {
    const convs = activeConvs(5);
    const result = detectStalls({
      convs,
      lastMessages: sameLast(convs, 'ai', fourDaysAgo),
      channelMap,
      daysThreshold: 3,
      countThreshold: 5,
      now,
    });
    expect(result).toEqual([
      { channel: 'wa', phase: 2, count: 5, daysStuckMin: 4, daysStuckMax: 4 },
    ]);
  });

  it('mide desde el último mensaje: si la persona escribió la última, no está sin contestar', () => {
    const convs = activeConvs(5);
    const lastMessages = new Map<number, LastMessageInfo>();
    for (const c of convs) lastMessages.set(c.id, lastMsg(c.id <= 3 ? 'ai' : 'lead', fourDaysAgo));
    expect(
      detectStalls({ convs, lastMessages, channelMap, daysThreshold: 3, countThreshold: 5, now }),
    ).toEqual([]);
    const r = detectStalls({
      convs,
      lastMessages,
      channelMap,
      daysThreshold: 3,
      countThreshold: 3,
      now,
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.count).toBe(3);
  });

  it('por debajo del umbral de días no cuenta', () => {
    const convs = activeConvs(5);
    const result = detectStalls({
      convs,
      lastMessages: sameLast(convs, 'ai', twoDaysAgo),
      channelMap,
      daysThreshold: 3,
      countThreshold: 5,
      now,
    });
    expect(result).toEqual([]);
  });

  it('excluye pausadas, handoffs, con outcome, de prueba, cerradas y sin mensajes', () => {
    const convs = activeConvs(7);
    convs[0]!.ai_paused_until = 'infinity';
    convs[1]!.is_handoff_to_human = true;
    // convs[2] lleva outcome (ver outcomeConvIds)
    convs[3]!.lead_id = 99; // la de Iván
    convs[4]!.state = 'closed';
    // convs[6] no tiene mensajes
    const lastMessages = sameLast(convs.slice(0, 6), 'ai', fourDaysAgo);
    const r = detectStalls({
      convs,
      lastMessages,
      channelMap,
      daysThreshold: 3,
      countThreshold: 1,
      outcomeConvIds: new Set([3]),
      testLeadIds: new Set([99]),
      now,
    });
    expect(r).toEqual([{ channel: 'wa', phase: 2, count: 1, daysStuckMin: 4, daysStuckMax: 4 }]);
  });

  it('agrupa por la fase actual (phase_number), no por el último cambio de fase', () => {
    const convs = [
      ...activeConvs(2, 2),
      ...activeConvs(3, 3).map((c) => ({ ...c, id: c.id + 10 })),
    ];
    const r = detectStalls({
      convs,
      lastMessages: sameLast(convs, 'ai', fourDaysAgo),
      channelMap,
      daysThreshold: 3,
      countThreshold: 1,
      now,
    });
    expect(r.map((g) => [g.phase, g.count]).sort()).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });
});

describe('detectAwaitingReply — esperando respuesta', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const threeHoursAgo = '2026-09-03T09:00:00Z';
  const oneHourAgo = '2026-09-03T11:00:00Z';
  const base = (o: Partial<ConvSnapshot> = {}) =>
    conv({ id: 1, ai_paused_until: null, is_handoff_to_human: false, lead_id: 5, ...o });

  it('último mensaje de la persona hace 3 h sin respuesta → cuenta', () => {
    const r = detectAwaitingReply({
      convs: [base()],
      lastMessages: new Map([[1, lastMsg('lead', threeHoursAgo)]]),
      hoursThreshold: 2,
      now,
    });
    expect(r.count).toBe(1);
    expect(r.convIds).toEqual([1]);
    expect(r.hoursWaitingMax).toBeCloseTo(3, 5);
  });

  it('hace 1 h → todavía no', () => {
    const r = detectAwaitingReply({
      convs: [base()],
      lastMessages: new Map([[1, lastMsg('lead', oneHourAgo)]]),
      hoursThreshold: 2,
      now,
    });
    expect(r.count).toBe(0);
  });

  it('la IA o la entrenadora ya contestaron → no cuenta', () => {
    for (const source of ['ai', 'human'] as const) {
      const r = detectAwaitingReply({
        convs: [base()],
        lastMessages: new Map([[1, lastMsg(source, threeHoursAgo)]]),
        hoursThreshold: 2,
        now,
      });
      expect(r.count).toBe(0);
    }
  });

  it('pausada, handoff, cerrada o de prueba (first_name Ivan) → no cuenta', () => {
    const convs = [
      base({ id: 1, ai_paused_until: 'infinity' }),
      base({ id: 2, is_handoff_to_human: true }),
      base({ id: 3, state: 'closed' }),
      base({ id: 4, lead_id: 99 }),
    ];
    const r = detectAwaitingReply({
      convs,
      lastMessages: sameLast(convs, 'lead', threeHoursAgo),
      hoursThreshold: 2,
      testLeadIds: new Set([99]),
      now,
    });
    expect(r.count).toBe(0);
  });
});

describe('detectUnattendedHandoffs — handoffs sin atender', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const thirtyHoursAgo = '2026-09-02T06:00:00Z';
  const tenHoursAgo = '2026-09-03T02:00:00Z';
  const handoff = (o: Partial<ConvSnapshot> = {}) =>
    conv({
      id: 1,
      state: 'closed',
      is_handoff_to_human: true,
      ai_paused_until: 'infinity',
      phase_number: 4,
      lead_id: 5,
      ...o,
    });

  it('handoff con 30 h sin mensaje de la entrenadora → cuenta, aunque el motor la dejara en state=closed', () => {
    const r = detectUnattendedHandoffs({
      convs: [handoff()],
      lastMessages: new Map([[1, lastMsg('lead', thirtyHoursAgo)]]),
      hoursThreshold: 24,
      now,
    });
    expect(r.count).toBe(1);
    expect(r.convIds).toEqual([1]);
    expect(r.hoursWaitingMax).toBeCloseTo(30, 5);
  });

  it('también si el último mensaje es del setter (el te-paso-con-ella sin que nadie siga)', () => {
    const r = detectUnattendedHandoffs({
      convs: [handoff()],
      lastMessages: new Map([[1, lastMsg('ai', thirtyHoursAgo)]]),
      hoursThreshold: 24,
      now,
    });
    expect(r.count).toBe(1);
  });

  it('la entrenadora contestó → no cuenta', () => {
    const r = detectUnattendedHandoffs({
      convs: [handoff()],
      lastMessages: new Map([[1, lastMsg('human', tenHoursAgo, tenHoursAgo)]]),
      hoursThreshold: 24,
      now,
    });
    expect(r.count).toBe(0);
  });

  it('hace 10 h → todavía no', () => {
    const r = detectUnattendedHandoffs({
      convs: [handoff()],
      lastMessages: new Map([[1, lastMsg('lead', tenHoursAgo)]]),
      hoursThreshold: 24,
      now,
    });
    expect(r.count).toBe(0);
  });

  it('sin handoff, F7 (cita agendada) o de prueba → no cuenta', () => {
    const convs = [
      handoff({ id: 1, is_handoff_to_human: false }),
      handoff({ id: 2, phase_number: 7, state: 'active' }),
      handoff({ id: 3, lead_id: 99 }),
    ];
    const r = detectUnattendedHandoffs({
      convs,
      lastMessages: sameLast(convs, 'lead', thirtyHoursAgo),
      hoursThreshold: 24,
      testLeadIds: new Set([99]),
      now,
    });
    expect(r.count).toBe(0);
  });
});

describe('ALL_CHANNEL_KEYS / ALL_MATRIX_COLUMNS exports', () => {
  it('canales son 4', () => {
    expect(ALL_CHANNEL_KEYS).toEqual(['wa', 'fb', 'ig-in', 'ig-out']);
  });
  it('matrix columns incluye total', () => {
    expect(ALL_MATRIX_COLUMNS.length).toBe(5);
    expect(ALL_MATRIX_COLUMNS).toContain('total');
  });
});
