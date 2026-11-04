import { describe, it, expect } from 'vitest';
import {
  enrichWithInboundOpenings,
  enrichWithLeadReplies,
  enrichWithTeamReplies,
  loadDashboardAlerts,
  loadKeywordPatterns,
  loadWindowAppointments,
  resolveChannelFilter,
} from '../../lib/dashboard-loader';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';
import type { ChannelInfo } from '../../lib/dashboard-query';

function conv(id: number, direction: 'inbound' | 'outbound'): ConvSnapshot {
  return {
    id,
    state: 'active',
    is_qualified: null,
    phase_number: 1,
    channel_id: 1,
    direction,
    last_message_at: null,
    created_at: '2026-09-01T00:00:00Z',
  };
}

/**
 * Supabase falso: registra cada lote de ids que se le pide y devuelve como
 * "mensajes de lead" los ids que el test declara respondidos.
 */
function makeSupabase(repliedIds: number[]): { batches: number[][]; client: any } {
  const batches: number[][] = [];
  const replied = new Set(repliedIds);
  const client = {
    from(table: string) {
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      let ids: number[] = [];
      const b: any = {
        select: () => b,
        in: (_col: string, values: number[]) => {
          ids = values;
          batches.push(values);
          return b;
        },
        eq: () =>
          Promise.resolve({
            data: ids.filter((id) => replied.has(id)).map((id) => ({ conversation_id: id })),
            error: null,
          }),
      };
      return b;
    },
  };
  return { batches, client };
}

describe('enrichWithLeadReplies', () => {
  it('marca solo las outbound, y solo las que tienen mensaje de la persona', async () => {
    const convs = [conv(1, 'outbound'), conv(2, 'outbound'), conv(3, 'inbound')];
    const sb = makeSupabase([2, 3]);
    const r = await enrichWithLeadReplies(sb.client, convs);
    expect(r.error).toBeNull();
    expect(convs[0]!.has_lead_reply).toBe(false);
    expect(convs[1]!.has_lead_reply).toBe(true);
    // La inbound no se consulta ni se marca: la pregunta "¿contestó?" no aplica.
    expect(convs[2]!.has_lead_reply).toBeUndefined();
    expect(sb.batches).toEqual([[1, 2]]);
  });

  it('trocea la consulta en lotes de 200 ids (límite de URL de PostgREST)', async () => {
    const convs = Array.from({ length: 450 }, (_, i) => conv(i + 1, 'outbound'));
    const sb = makeSupabase([1, 450]);
    await enrichWithLeadReplies(sb.client, convs);
    expect(sb.batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(convs[0]!.has_lead_reply).toBe(true);
    expect(convs[449]!.has_lead_reply).toBe(true);
    expect(convs[200]!.has_lead_reply).toBe(false);
  });

  it('sin outbound no consulta nada', async () => {
    const sb = makeSupabase([]);
    await enrichWithLeadReplies(sb.client, [conv(1, 'inbound')]);
    expect(sb.batches).toEqual([]);
  });
});

/**
 * Supabase falso para `enrichWithTeamReplies`: registra los lotes de ids y los
 * orígenes pedidos, y devuelve como "contestadas" las que declara el test.
 */
function makeTeamSupabase(answeredIds: number[]): {
  batches: number[][];
  sources: string[][];
  client: any;
} {
  const batches: number[][] = [];
  const sources: string[][] = [];
  const answered = new Set(answeredIds);
  const client = {
    from(table: string) {
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      let ids: number[] = [];
      const b: any = {
        select: () => b,
        in: (col: string, values: any[]) => {
          if (col === 'conversation_id') {
            ids = values as number[];
            batches.push(values as number[]);
            return b;
          }
          sources.push(values as string[]);
          return Promise.resolve({
            data: ids.filter((id) => answered.has(id)).map((id) => ({ conversation_id: id })),
            error: null,
          });
        },
      };
      return b;
    },
  };
  return { batches, sources, client };
}

describe('enrichWithTeamReplies', () => {
  it('marca solo las inbound, y solo las que tienen mensaje de la entrenadora o de la IA', async () => {
    const convs = [conv(1, 'inbound'), conv(2, 'inbound'), conv(3, 'outbound')];
    const sb = makeTeamSupabase([2, 3]);
    const r = await enrichWithTeamReplies(sb.client, convs);
    expect(r.error).toBeNull();
    expect(convs[0]!.has_team_reply).toBe(false);
    expect(convs[1]!.has_team_reply).toBe(true);
    // La outbound no se consulta ni se marca: "¿le contestaron?" no aplica.
    expect(convs[2]!.has_team_reply).toBeUndefined();
    expect(sb.batches).toEqual([[1, 2]]);
    expect(sb.sources).toEqual([['ai', 'human']]);
  });

  it('trocea la consulta en lotes de 200 ids', async () => {
    const convs = Array.from({ length: 401 }, (_, i) => conv(i + 1, 'inbound'));
    const sb = makeTeamSupabase([401]);
    await enrichWithTeamReplies(sb.client, convs);
    expect(sb.batches.map((b) => b.length)).toEqual([200, 200, 1]);
    expect(convs[400]!.has_team_reply).toBe(true);
    expect(convs[0]!.has_team_reply).toBe(false);
  });

  it('sin inbound no consulta nada', async () => {
    const sb = makeTeamSupabase([]);
    await enrichWithTeamReplies(sb.client, [conv(1, 'outbound')]);
    expect(sb.batches).toEqual([]);
  });
});

interface AppointmentDbRow {
  id: number;
  conversation_id: number | null;
  lead_id: number | null;
  appointment_status: string;
  booked_at: string;
  start_at: string;
  conversations: { channel_id: number | null; direction: string | null } | null;
}

/**
 * Supabase falso para `calendar_appointments`: devuelve las filas tal cual y
 * registra el select que se le pide, que es lo que aquí importa.
 */
function makeAppointmentsSupabase(rows: AppointmentDbRow[]) {
  const selects: string[] = [];
  const client: any = {
    from(table: string) {
      if (table !== 'calendar_appointments') throw new Error(`tabla inesperada ${table}`);
      const b: any = {
        select: (sel: string) => {
          selects.push(sel);
          return b;
        },
        eq: () => b,
        gte: () => b,
        lte: () => Promise.resolve({ data: rows, error: null }),
      };
      return b;
    },
  };
  return { selects, client };
}

describe('loadWindowAppointments', () => {
  const rows: AppointmentDbRow[] = [
    // casada con una conv de WhatsApp inbound
    {
      id: 1,
      conversation_id: 100,
      lead_id: 7,
      appointment_status: 'confirmed',
      booked_at: '2026-09-10T10:00:00Z',
      start_at: '2026-09-15T10:00:00Z',
      conversations: { channel_id: 10, direction: 'inbound' },
    },
    // casada con una conv de Instagram outbound
    {
      id: 2,
      conversation_id: 200,
      lead_id: 8,
      appointment_status: 'new',
      booked_at: '2026-09-11T10:00:00Z',
      start_at: '2026-09-16T10:00:00Z',
      conversations: { channel_id: 20, direction: 'outbound' },
    },
    // huérfana: no casó con ninguna conversación
    {
      id: 3,
      conversation_id: null,
      lead_id: null,
      appointment_status: 'new',
      booked_at: '2026-09-12T10:00:00Z',
      start_at: '2026-09-17T10:00:00Z',
      conversations: null,
    },
  ];

  it('embebe conversations por conversation_id: hay dos FKs entre las tablas y PostgREST no elige sola', async () => {
    const sb = makeAppointmentsSupabase(rows);
    await loadWindowAppointments(sb.client, {
      tenantId: 1,
      fromIso: '2026-09-01T00:00:00Z',
      toIso: '2026-09-30T00:00:00Z',
      channelIds: null,
      direction: null,
    });
    expect(sb.selects).toHaveLength(1);
    // Sin el hint el servidor responde PGRST201 ("more than one relationship was
    // found for 'calendar_appointments' and 'conversations'") y cae el dashboard.
    expect(sb.selects[0]).toContain('conversations!conversation_id(');
  });

  it('sin filtro devuelve todas, con el canal y la dirección de la conv casada', async () => {
    const sb = makeAppointmentsSupabase(rows);
    const r = await loadWindowAppointments(sb.client, {
      tenantId: 1,
      fromIso: '2026-09-01T00:00:00Z',
      toIso: '2026-09-30T00:00:00Z',
      channelIds: null,
      direction: null,
    });
    expect(r.error).toBeNull();
    expect(r.appointments.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(r.appointments[0]).toMatchObject({ channel_id: 10, direction: 'inbound' });
    expect(r.appointments[2]).toMatchObject({
      conversation_id: null,
      channel_id: null,
      direction: null,
    });
  });

  it('el filtro de canal y dirección se aplica sobre la conv casada; la huérfana no pasa ninguno', async () => {
    const sb = makeAppointmentsSupabase(rows);
    const byChannel = await loadWindowAppointments(sb.client, {
      tenantId: 1,
      fromIso: '2026-09-01T00:00:00Z',
      toIso: '2026-09-30T00:00:00Z',
      channelIds: [20],
      direction: null,
    });
    expect(byChannel.appointments.map((a) => a.id)).toEqual([2]);

    const byDirection = await loadWindowAppointments(sb.client, {
      tenantId: 1,
      fromIso: '2026-09-01T00:00:00Z',
      toIso: '2026-09-30T00:00:00Z',
      channelIds: null,
      direction: 'inbound',
    });
    expect(byDirection.appointments.map((a) => a.id)).toEqual([1]);
  });
});

describe('resolveChannelFilter', () => {
  const channelMap = new Map<number, ChannelInfo>([
    [10, { kind: 'whatsapp' }],
    [20, { kind: 'instagram_dm' }],
    [30, { kind: 'facebook_messenger' }],
  ]);

  it('all → sin restricción', () => {
    expect(resolveChannelFilter('all', channelMap)).toEqual({ channelIds: null, direction: null });
  });

  it('ig-out es el canal de Instagram partido por dirección', () => {
    expect(resolveChannelFilter('ig-out', channelMap)).toEqual({
      channelIds: [20],
      direction: 'outbound',
    });
    expect(resolveChannelFilter('ig-in', channelMap)).toEqual({
      channelIds: [20],
      direction: 'inbound',
    });
  });

  it('wa y fb no imponen dirección', () => {
    expect(resolveChannelFilter('wa', channelMap)).toEqual({ channelIds: [10], direction: null });
    expect(resolveChannelFilter('fb', channelMap)).toEqual({ channelIds: [30], direction: null });
  });
});

describe('loadDashboardAlerts', () => {
  function makeRpcSupabase(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client: any = {
      rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
      },
      from() {
        throw new Error('las alertas no deben consultar tablas: van por la RPC');
      },
    };
    return { calls, client };
  }

  it('llama a dashboard_alerts con el tenant y los umbrales, y devuelve las filas tipadas', async () => {
    const sb = makeRpcSupabase({
      data: {
        computed_at: '2026-11-04T10:00:00+00:00',
        awaiting_reply: [{ conversation_id: 1, last_message_at: '2026-11-04T07:00:00+00:00' }],
        handoff_unattended: [],
        stalls: [],
        inbound_unattended: [
          {
            conversation_id: 2,
            last_message_at: '2026-11-03T07:00:00+00:00',
            first_lead_text: 'Siii😊',
            first_lead_at: '2026-11-03T07:00:00+00:00',
            first_auto_reply_at: null,
          },
        ],
      },
    });
    const r = await loadDashboardAlerts(sb.client, {
      tenantId: 7,
      awaitingHours: 2,
      handoffHours: 24,
      stallDays: 3,
    });
    expect(r.error).toBeNull();
    expect(sb.calls).toEqual([
      {
        fn: 'dashboard_alerts',
        args: { p_tenant_id: 7, p_awaiting_hours: 2, p_handoff_hours: 24, p_stall_days: 3 },
      },
    ]);
    expect(r.alerts.awaitingReply.map((x) => x.conversation_id)).toEqual([1]);
    expect(r.alerts.inboundUnattended[0]!.first_lead_text).toBe('Siii😊');
    expect(r.alerts.computedAt).toBe('2026-11-04T10:00:00+00:00');
  });

  it('si la función no existe (PGRST202) lo dice con la migración que falta', async () => {
    const sb = makeRpcSupabase({
      error: { code: 'PGRST202', message: 'Could not find the function public.dashboard_alerts' },
    });
    const r = await loadDashboardAlerts(sb.client, {
      tenantId: 7,
      awaitingHours: 2,
      handoffHours: 24,
      stallDays: 3,
    });
    expect(r.error).toContain('085-dashboard-alerts-rpc.sql');
    expect(r.alerts.awaitingReply).toEqual([]);
  });

  it('otro error → se devuelve tal cual, con listas vacías', async () => {
    const sb = makeRpcSupabase({ error: { message: 'timeout' } });
    const r = await loadDashboardAlerts(sb.client, {
      tenantId: 7,
      awaitingHours: 2,
      handoffHours: 24,
      stallDays: 3,
    });
    expect(r.error).toBe('dashboard_alerts: timeout');
    expect(r.alerts.inboundUnattended).toEqual([]);
  });
});

describe('loadKeywordPatterns', () => {
  it('devuelve los patrones del tenant, activos o no, sin vacíos', async () => {
    const filters: Array<[string, unknown]> = [];
    const client: any = {
      from(table: string) {
        if (table !== 'automation_keywords') throw new Error(`tabla inesperada ${table}`);
        const b: any = {
          select: () => b,
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return Promise.resolve({
              data: [{ pattern: 'Espalda' }, { pattern: '' }, { pattern: null }, { pattern: 'Hernia' }],
              error: null,
            });
          },
        };
        return b;
      },
    };
    const r = await loadKeywordPatterns(client, 7);
    expect(r.error).toBeNull();
    expect(r.patterns).toEqual(['Espalda', 'Hernia']);
    expect(filters).toEqual([['tenant_id', 7]]);
  });
});

describe('enrichWithInboundOpenings', () => {
  interface OpeningRow {
    id: number;
    conversation_id: number;
    source: 'lead' | 'system';
    content: string | null;
    sent_at: string;
  }

  /** Supabase falso: mensajes lead/system por conversación; si pide las palabras clave, lo registra. */
  function makeOpeningsSupabase(rows: OpeningRow[]) {
    let keywordQueries = 0;
    const client: any = {
      from(table: string) {
        if (table === 'automation_keywords') {
          keywordQueries += 1;
          const k: any = {
            select: () => k,
            eq: () => Promise.resolve({ data: [{ pattern: 'espalda' }], error: null }),
          };
          return k;
        }
        if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
        let ids: number[] = [];
        const b: any = {
          select: () => b,
          in: (col: string, values: unknown[]) => {
            if (col === 'conversation_id') ids = values as number[];
            return b;
          },
          order: () => b,
          range: (from: number, to: number) => {
            const idSet = new Set(ids);
            const page = rows
              .filter((r) => idSet.has(r.conversation_id))
              .sort((x, y) => x.sent_at.localeCompare(y.sent_at) || x.id - y.id)
              .slice(from, to + 1);
            return Promise.resolve({ data: page, error: null });
          },
        };
        return b;
      },
    };
    return { client, keywordQueries: () => keywordQueries };
  }

  it('con las palabras clave ya cargadas no vuelve a pedirlas y marca el flujo de palabra clave', async () => {
    const convs = [conv(1, 'inbound'), conv(2, 'inbound'), conv(3, 'outbound')];
    const sb = makeOpeningsSupabase([
      { id: 1, conversation_id: 1, source: 'lead', content: 'espalda', sent_at: '2026-10-20T10:00:00Z' },
      { id: 2, conversation_id: 2, source: 'lead', content: 'Tengo una hernia, ¿me puedes ayudar?', sent_at: '2026-10-20T10:00:00Z' },
    ]);
    const r = await enrichWithInboundOpenings(sb.client, convs, 7, ['Espalda']);
    expect(r.error).toBeNull();
    expect(sb.keywordQueries()).toBe(0);
    expect(convs[0]!.inbound_keyword_flow).toBe(true);
    expect(convs[1]!.inbound_keyword_flow).toBe(false);
    // La outbound no se toca.
    expect(convs[2]!.inbound_keyword_flow).toBeUndefined();
  });

  it('sin palabras clave pasadas las carga ella (compatibilidad con el drill-down)', async () => {
    const convs = [conv(1, 'inbound')];
    const sb = makeOpeningsSupabase([
      { id: 1, conversation_id: 1, source: 'lead', content: 'espalda', sent_at: '2026-10-20T10:00:00Z' },
    ]);
    await enrichWithInboundOpenings(sb.client, convs, 7);
    expect(sb.keywordQueries()).toBe(1);
    expect(convs[0]!.inbound_keyword_flow).toBe(true);
  });
});
