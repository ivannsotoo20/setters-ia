import { describe, it, expect } from 'vitest';
import {
  classifyChannel,
  aggregateMatrix,
  detectAwaitingReply,
  detectInboundUnattended,
  detectStalls,
  detectUnattendedHandoffs,
  isTestLeadName,
  parseDashboardAlertsRpc,
  ALL_CHANNEL_KEYS,
  ALL_MATRIX_COLUMNS,
  type AlertConvRow,
  type ChannelInfo,
  type InboundUnattendedRow,
  type StallConvRow,
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
  it('6 rows en orden Leads/Activas/Cualificados/Enlaces enviados/Citas agendadas/Ganados', () => {
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
      'link_sent',
      'scheduled',
      'won',
    ]);
  });

  it('scheduled se llena con citas reales situadas en el canal de su conversación', () => {
    const channelMap = new Map<number, ChannelInfo>([
      [1, { kind: 'whatsapp' }],
      [2, { kind: 'instagram_dm' }],
    ]);
    const m = aggregateMatrix({
      events: [ev({ to_value: '6', conversation_id: 1 })],
      convs: [conv({ id: 1, channel_id: 1 })],
      prevEvents: [],
      prevConvs: [],
      channelMap,
      windowFromIso: '2026-05-10T00:00:00Z',
      prevWindowFromIso: '2026-05-10T00:00:00Z',
      appointments: [
        { id: 1, conversation_id: 1, lead_id: 1, appointment_status: 'confirmed', booked_at: '2026-05-10T10:00:00Z', start_at: '2026-05-12T10:00:00Z', channel_id: 1, direction: 'inbound' },
        { id: 2, conversation_id: 2, lead_id: 2, appointment_status: 'confirmed', booked_at: '2026-05-10T10:00:00Z', start_at: '2026-05-12T10:00:00Z', channel_id: 2, direction: 'outbound' },
        { id: 3, conversation_id: 3, lead_id: 3, appointment_status: 'cancelled', booked_at: '2026-05-10T10:00:00Z', start_at: '2026-05-12T10:00:00Z', channel_id: 1, direction: 'inbound' },
      ],
    });
    const linkSent = m.rows.find((r) => r.key === 'link_sent')!;
    const scheduled = m.rows.find((r) => r.key === 'scheduled')!;
    expect(linkSent.cells.wa.count).toBe(1);
    expect(scheduled.cells.wa.count).toBe(1);
    expect(scheduled.cells['ig-out'].count).toBe(1);
    expect(scheduled.cells['ig-in'].count).toBe(0);
    expect(scheduled.cells.total.count).toBe(2);
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

/**
 * Alertas de conversación sobre las filas de la RPC `dashboard_alerts`
 * (migración 085). La RPC ya aplica estado, pausa, handoff y umbral en SQL; aquí
 * se prueba lo que queda en JS: el parseo tolerante del jsonb, el repaso del
 * umbral, las horas, la agrupación de atascos y, en los inbound, qué aperturas
 * son el flujo de una palabra clave y cuáles son una persona de verdad.
 */
const NOW = new Date('2026-09-03T12:00:00Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600000).toISOString();
}

function alertRow(id: number, hoursSince: number): AlertConvRow {
  return { conversation_id: id, last_message_at: hoursAgo(hoursSince) };
}

function stallRow(
  id: number,
  daysSince: number,
  o: Partial<StallConvRow> = {},
): StallConvRow {
  return {
    conversation_id: id,
    last_message_at: hoursAgo(daysSince * 24),
    channel_id: 1,
    direction: 'inbound',
    phase_number: 2,
    ...o,
  };
}

function inboundRow(
  id: number,
  firstText: string | null,
  o: Partial<InboundUnattendedRow> = {},
): InboundUnattendedRow {
  return {
    conversation_id: id,
    last_message_at: hoursAgo(id),
    first_lead_text: firstText,
    first_lead_at: hoursAgo(id + 1),
    first_auto_reply_at: null,
    ...o,
  };
}

describe('parseDashboardAlertsRpc — el jsonb de la RPC a filas tipadas', () => {
  it('lee las cuatro listas con sus campos', () => {
    const r = parseDashboardAlertsRpc({
      computed_at: '2026-09-03T12:00:00+00:00',
      awaiting_reply: [{ conversation_id: 1, last_message_at: '2026-09-03T09:00:00+00:00' }],
      handoff_unattended: [{ conversation_id: '2', last_message_at: '2026-09-02T06:00:00+00:00' }],
      stalls: [
        {
          conversation_id: 3,
          channel_id: 10,
          direction: 'outbound',
          phase_number: 2,
          last_message_at: '2026-08-30T12:00:00+00:00',
        },
      ],
      inbound_unattended: [
        {
          conversation_id: 4,
          last_message_at: '2026-09-01T10:00:00+00:00',
          first_lead_text: 'Como tratar una hernia discal',
          first_lead_at: '2026-09-01T10:00:00+00:00',
          first_auto_reply_at: null,
        },
      ],
    });
    expect(r.computedAt).toBe('2026-09-03T12:00:00+00:00');
    expect(r.awaitingReply).toEqual([
      { conversation_id: 1, last_message_at: '2026-09-03T09:00:00+00:00' },
    ]);
    // Los ids pueden venir como texto (bigint en jsonb): se convierten.
    expect(r.handoffUnattended[0]!.conversation_id).toBe(2);
    expect(r.stalls[0]).toEqual({
      conversation_id: 3,
      last_message_at: '2026-08-30T12:00:00+00:00',
      channel_id: 10,
      direction: 'outbound',
      phase_number: 2,
    });
    expect(r.inboundUnattended[0]).toMatchObject({
      conversation_id: 4,
      first_lead_text: 'Como tratar una hernia discal',
      first_auto_reply_at: null,
    });
  });

  it('descarta filas sin id o sin fecha y tolera listas que falten', () => {
    const r = parseDashboardAlertsRpc({
      awaiting_reply: [
        { conversation_id: 1 },
        { last_message_at: '2026-09-03T09:00:00+00:00' },
        { conversation_id: 2, last_message_at: 'no es una fecha' },
        { conversation_id: 3, last_message_at: '2026-09-03T09:00:00+00:00' },
        'basura',
      ],
      stalls: [{ conversation_id: 9, last_message_at: '2026-09-03T09:00:00+00:00' }],
    });
    expect(r.awaitingReply.map((x) => x.conversation_id)).toEqual([3]);
    // Un atasco sin canal ni fase no se puede agrupar: fuera.
    expect(r.stalls).toEqual([]);
    expect(r.handoffUnattended).toEqual([]);
    expect(r.inboundUnattended).toEqual([]);
    expect(r.computedAt).toBeNull();
  });

  it('null, texto o array → todo vacío, nunca lanza', () => {
    for (const raw of [null, undefined, 'x', 42, [1, 2]]) {
      const r = parseDashboardAlertsRpc(raw);
      expect(r.awaitingReply).toEqual([]);
      expect(r.handoffUnattended).toEqual([]);
      expect(r.stalls).toEqual([]);
      expect(r.inboundUnattended).toEqual([]);
    }
  });
});

describe('detectStalls — sin respuesta de la persona', () => {
  const channelMap = new Map<number, ChannelInfo>([
    [1, { kind: 'whatsapp' }],
    [2, { kind: 'instagram_dm' }],
  ]);

  it('5 en F2 con el último mensaje de la IA hace 4 días → grupo wa:2', () => {
    const rows = [1, 2, 3, 4, 5].map((id) => stallRow(id, 4));
    expect(
      detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 5, now: NOW }),
    ).toEqual([{ channel: 'wa', phase: 2, count: 5, daysStuckMin: 4, daysStuckMax: 4 }]);
  });

  it('daysStuckMin es el del que menos lleva: "más de N días" vale para todos', () => {
    const rows = [stallRow(1, 3), stallRow(2, 5), stallRow(3, 9)];
    const r = detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 3, now: NOW });
    expect(r).toEqual([{ channel: 'wa', phase: 2, count: 3, daysStuckMin: 3, daysStuckMax: 9 }]);
  });

  it('menos del mínimo por grupo → no sale; bajando el mínimo, sí', () => {
    const rows = [1, 2, 3].map((id) => stallRow(id, 4));
    expect(detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 5, now: NOW })).toEqual([]);
    expect(detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 3, now: NOW })).toHaveLength(1);
  });

  it('con un outcome aplicado ya salió del embudo → no cuenta', () => {
    const rows = [1, 2, 3, 4, 5].map((id) => stallRow(id, 4));
    const r = detectStalls({
      rows,
      channelMap,
      daysThreshold: 3,
      countThreshold: 5,
      outcomeConvIds: new Set([5]),
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it('Instagram se parte por quién abrió: ig-in e ig-out son grupos distintos', () => {
    const rows = [
      ...[1, 2, 3].map((id) => stallRow(id, 4, { channel_id: 2, direction: 'inbound' })),
      ...[4, 5, 6].map((id) => stallRow(id, 6, { channel_id: 2, direction: 'outbound' })),
    ];
    const r = detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 3, now: NOW });
    expect(r.map((s) => s.channel).sort()).toEqual(['ig-in', 'ig-out']);
  });

  it('canal desconocido, fase fuera de F1–F6 o menos días que el umbral → fuera', () => {
    const rows = [
      ...[1, 2, 3].map((id) => stallRow(id, 4, { channel_id: 99 })),
      ...[4, 5, 6].map((id) => stallRow(id, 4, { phase_number: 7 })),
      ...[7, 8, 9].map((id) => stallRow(id, 2)),
    ];
    expect(detectStalls({ rows, channelMap, daysThreshold: 3, countThreshold: 1, now: NOW })).toEqual([]);
  });
});

describe('detectAwaitingReply — esperando respuesta', () => {
  it('último mensaje de la persona hace 3 h → cuenta, con sus horas', () => {
    const r = detectAwaitingReply({ rows: [alertRow(1, 3)], hoursThreshold: 2, now: NOW });
    expect(r.count).toBe(1);
    expect(r.convIds).toEqual([1]);
    expect(r.hoursWaitingMax).toBeCloseTo(3, 5);
  });

  it('ordena de la que más lleva esperando a la que menos (la URL se queda con las primeras)', () => {
    const r = detectAwaitingReply({
      rows: [alertRow(1, 3), alertRow(2, 48), alertRow(3, 7)],
      hoursThreshold: 2,
      now: NOW,
    });
    expect(r.convIds).toEqual([2, 3, 1]);
    expect(r.hoursWaitingMax).toBeCloseTo(48, 5);
  });

  it('"más de 2 h": a las 2 h justas o antes todavía no', () => {
    const r = detectAwaitingReply({
      rows: [alertRow(1, 2), alertRow(2, 1), alertRow(3, 2.01)],
      hoursThreshold: 2,
      now: NOW,
    });
    expect(r.convIds).toEqual([3]);
  });

  it('sin filas → vacío con horas 0', () => {
    expect(detectAwaitingReply({ rows: [], hoursThreshold: 2, now: NOW })).toEqual({
      count: 0,
      hoursWaitingMax: 0,
      convIds: [],
    });
  });
});

describe('detectUnattendedHandoffs — handoffs sin atender', () => {
  it('30 h sin mensaje de la entrenadora → cuenta; 10 h → todavía no', () => {
    const r = detectUnattendedHandoffs({
      rows: [alertRow(1, 30), alertRow(2, 10)],
      hoursThreshold: 24,
      now: NOW,
    });
    expect(r.count).toBe(1);
    expect(r.convIds).toEqual([1]);
    expect(r.hoursWaitingMax).toBeCloseTo(30, 5);
  });
});

describe('detectInboundUnattended — te escribieron y la IA no las atiende', () => {
  // Las del tenant 7: activas o no, se comparan normalizadas.
  const patterns = ['Espalda', 'Hernia', 'Información', 'cervical'];

  it('entra quien escribió con interés real; no el flujo de una palabra clave ni un botón', () => {
    const rows = [
      inboundRow(1, 'Tengo una hernia y me gustaría saber cómo me puedes ayudar'),
      inboundRow(2, 'espalda'),
      inboundRow(3, 'Siii😊'),
      inboundRow(4, 'Hola, si por favor'),
      inboundRow(5, 'hola! cervical también?'),
      inboundRow(6, 'Empezar'),
      inboundRow(7, 'Hérnia'),
    ];
    const r = detectInboundUnattended({ rows, keywordPatterns: patterns, now: NOW });
    // Ordenadas de la que más lleva (id 5: hoursAgo(5)) a la que menos.
    expect(r.convIds).toEqual([5, 1]);
    expect(r.count).toBe(2);
    expect(r.hoursWaitingMax).toBeCloseTo(5, 5);
  });

  it('un saludo solo o un audio sin texto son una persona, no una automatización', () => {
    const rows = [inboundRow(1, 'Hola'), inboundRow(2, null), inboundRow(3, '👍')];
    const r = detectInboundUnattended({ rows, keywordPatterns: patterns, now: NOW });
    expect(r.convIds.sort()).toEqual([1, 2, 3]);
  });

  it('si una automatización nuestra contestó en segundos, es flujo de palabra clave aunque la palabra no esté en la lista', () => {
    const at = hoursAgo(10);
    const rows = [
      inboundRow(1, 'rodilla', {
        first_lead_at: at,
        first_auto_reply_at: new Date(Date.parse(at) + 45_000).toISOString(),
      }),
      inboundRow(2, 'rodilla', {
        first_lead_at: at,
        first_auto_reply_at: new Date(Date.parse(at) + 10 * 60_000).toISOString(),
      }),
    ];
    const r = detectInboundUnattended({ rows, keywordPatterns: patterns, now: NOW });
    expect(r.convIds).toEqual([2]);
  });

  it('sin umbral de horas: con la IA pausada nadie va a contestar, una de hace 5 minutos ya cuenta', () => {
    const rows = [inboundRow(1, 'Quiero información del programa', { last_message_at: hoursAgo(5 / 60) })];
    const r = detectInboundUnattended({ rows, keywordPatterns: patterns, now: NOW });
    expect(r.count).toBe(1);
    expect(r.hoursWaitingMax).toBeCloseTo(5 / 60, 5);
  });

  it('sin palabras clave del tenant, los botones siguen fuera', () => {
    const rows = [inboundRow(1, 'Si'), inboundRow(2, 'Me duele la espalda desde hace meses')];
    expect(detectInboundUnattended({ rows, keywordPatterns: [], now: NOW }).convIds).toEqual([2]);
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
