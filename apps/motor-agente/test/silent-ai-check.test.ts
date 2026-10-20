import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSilentAi, findSilentConversations } from '../src/services/silent-ai-check.js';
import { processNotificationQueue } from '../src/services/notify-trainer.js';

/**
 * 2026-10-20 — alerta de IA muda. Del 17 al 20 de octubre la IA de Tania no
 * contestó a nadie durante tres días sin que saltara nada: solo se vigilaba
 * `last_webhook_at`, que seguía al día. La alerta mira el síntoma (lead sin
 * respuesta) y avisa a la agencia, no al entrenador.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Supabase en memoria: eq/in/gte/lte/order/limit/maybeSingle, insert y update. */
function makeDb(tables: Tables) {
  let nextId = 10_000;
  const client = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let orderBy: { col: string; asc: boolean } | null = null;
      let limitN: number | null = null;
      let single = false;
      let insertRow: Row | null = null;
      let updatePatch: Row | null = null;

      const rows = () => (tables[table] ??= []);
      const run = () => {
        if (insertRow) {
          const rec = { id: nextId++, created_at: new Date(NOW).toISOString(), ...insertRow };
          rows().push(rec);
          return { data: rec, error: null };
        }
        let out = rows().filter((r) => filters.every((f) => f(r)));
        if (updatePatch) {
          for (const r of out) Object.assign(r, updatePatch);
          return { data: null, error: null };
        }
        if (orderBy) {
          const { col, asc } = orderBy;
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        if (limitN != null) out = out.slice(0, limitN);
        return { data: single ? (out[0] ?? null) : out, error: null };
      };

      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
        gte: (col: string, val: string) => (filters.push((r) => String(r[col]) >= val), b),
        lte: (col: string, val: string) => (filters.push((r) => String(r[col]) <= val), b),
        order: (col: string, opts?: { ascending?: boolean }) => (
          (orderBy = { col, asc: opts?.ascending !== false }), b
        ),
        limit: (n: number) => ((limitN = n), b),
        maybeSingle: () => ((single = true), b),
        insert: (row: Row) => ((insertRow = row), b),
        update: (patch: Row) => ((updatePatch = patch), b),
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return b;
    },
  };
  return client as unknown as SupabaseClient;
}

const NOW = Date.parse('2026-10-20T10:30:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const now = () => new Date(NOW);

/** Tenant 7 con WhatsApp (YCloud) e Instagram (GHL) conectados; Facebook sin integración. */
function baseTables(): Tables {
  return {
    tenant_configs: [{ tenant_id: 7, ai_enabled: true }],
    channels: [
      { id: 1, tenant_id: 7, channel_type: 'whatsapp' },
      { id: 2, tenant_id: 7, channel_type: 'instagram_dm' },
      { id: 3, tenant_id: 7, channel_type: 'facebook_messenger' },
    ],
    integration_accounts: [
      { id: 21, tenant_id: 7, channel_id: 1, is_active: true },
      { id: 22, tenant_id: 7, channel_id: 2, is_active: true },
    ],
    conversations: [],
    conversation_messages: [],
    notification_events: [],
  };
}

let msgId = 1;
function conv(t: Tables, id: number, over: Row = {}): void {
  t.conversations!.push({
    id,
    tenant_id: 7,
    channel_id: 2,
    state: 'active',
    ai_paused_until: null,
    is_handoff_to_human: false,
    ...over,
  });
}
function msg(t: Tables, conversationId: number, source: string, minutes: number): number {
  const id = msgId++;
  t.conversation_messages!.push({
    id,
    conversation_id: conversationId,
    tenant_id: 7,
    source,
    sent_at: minutesAgo(minutes),
  });
  return id;
}

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => {
  msgId = 1;
  vi.clearAllMocks();
});

describe('findSilentConversations', () => {
  it('lead sin respuesta hace más de 15 min → muda', async () => {
    const t = baseTables();
    conv(t, 13750);
    msg(t, 13750, 'ai', 60);
    const leadId = msg(t, 13750, 'lead', 20);

    const silent = await findSilentConversations({ supabase: makeDb(t) as never, now });
    expect(silent).toEqual([
      {
        conversationId: 13750,
        tenantId: 7,
        channelType: 'instagram_dm',
        lastLeadMessageId: leadId,
        lastLeadAt: minutesAgo(20),
      },
    ]);
  });

  it('con respuesta de la IA o de un humano después, no', async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 30);
    msg(t, 1, 'ai', 29);
    conv(t, 2);
    msg(t, 2, 'lead', 30);
    msg(t, 2, 'human', 25);
    expect(await findSilentConversations({ supabase: makeDb(t) as never, now })).toEqual([]);
  });

  it("un mensaje 'system' (automatización del proveedor) no cuenta como respuesta", async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 30);
    msg(t, 1, 'system', 29);
    const silent = await findSilentConversations({ supabase: makeDb(t) as never, now });
    expect(silent.map((s) => s.conversationId)).toEqual([1]);
  });

  it('el último mensaje del lead sin respuesta cuenta aunque el anterior sí la tuviera', async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 90);
    msg(t, 1, 'ai', 89);
    msg(t, 1, 'lead', 40);
    expect((await findSilentConversations({ supabase: makeDb(t) as never, now })).length).toBe(1);
  });

  it('dentro del umbral todavía no, y fuera de la ventana de 24 h tampoco', async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 5);
    conv(t, 2);
    msg(t, 2, 'lead', 25 * 60);
    expect(await findSilentConversations({ supabase: makeDb(t) as never, now })).toEqual([]);
  });

  it('respeta la pausa, el handoff y el estado; una pausa vencida ya no cuenta', async () => {
    const t = baseTables();
    conv(t, 1, { ai_paused_until: 'infinity' });
    conv(t, 2, { ai_paused_until: minutesAgo(-60) }); // pausada una hora más
    conv(t, 3, { is_handoff_to_human: true });
    conv(t, 4, { state: 'stopped' });
    conv(t, 5, { ai_paused_until: minutesAgo(120) }); // pausa vencida: IA activa
    for (const id of [1, 2, 3, 4, 5]) msg(t, id, 'lead', 30);

    const silent = await findSilentConversations({ supabase: makeDb(t) as never, now });
    expect(silent.map((s) => s.conversationId)).toEqual([5]);
  });

  it('sin integración activa en el canal (Facebook de Tania) o con la IA apagada, no avisa', async () => {
    const t = baseTables();
    conv(t, 1, { channel_id: 3 }); // facebook sin integration_account
    msg(t, 1, 'lead', 30);
    expect(await findSilentConversations({ supabase: makeDb(t) as never, now })).toEqual([]);

    const t2 = baseTables();
    t2.tenant_configs = [{ tenant_id: 7, ai_enabled: false }];
    conv(t2, 2);
    msg(t2, 2, 'lead', 30);
    expect(await findSilentConversations({ supabase: makeDb(t2) as never, now })).toEqual([]);
  });
});

describe('checkSilentAi', () => {
  it('encola un aviso error_motor/ai_silent por tenant con las conversaciones mudas', async () => {
    const t = baseTables();
    conv(t, 13750);
    msg(t, 13750, 'lead', 183);
    conv(t, 13886, { channel_id: 1 });
    msg(t, 13886, 'lead', 40);

    const res = await checkSilentAi({ supabase: makeDb(t) as never, now, log: silentLog });
    expect(res).toEqual({ silent: 2, enqueued: 1, skipped: 0, errors: 0 });

    const [event] = t.notification_events!;
    expect(event).toMatchObject({ tenant_id: 7, event_type: 'error_motor', status: 'pending' });
    expect(event!.payload).toMatchObject({
      kind: 'ai_silent',
      threshold_minutes: 15,
      total_silent: 2,
      new_silent: 2,
      oldest_unanswered_at: minutesAgo(183),
    });
    const listed = (event!.payload as { conversations: Row[] }).conversations;
    expect(listed.map((c) => c.conversation_id)).toEqual([13750, 13886]);
    expect(listed[1]).toMatchObject({ channel_type: 'whatsapp' });
  });

  it('no repite: dentro de 30 min no avisa y después solo avisa de lo nuevo', async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 20);
    const db = makeDb(t);

    await checkSilentAi({ supabase: db as never, now, log: silentLog });
    expect(t.notification_events).toHaveLength(1);
    t.notification_events![0]!.created_at = minutesAgo(10);

    // 10 min después del aviso: throttle.
    expect(await checkSilentAi({ supabase: db as never, now, log: silentLog })).toMatchObject({
      enqueued: 0,
      skipped: 1,
    });

    // 40 min después: la misma conversación con el mismo mensaje ya se avisó.
    t.notification_events![0]!.created_at = minutesAgo(40);
    expect(await checkSilentAi({ supabase: db as never, now, log: silentLog })).toMatchObject({
      enqueued: 0,
      skipped: 1,
    });

    // El lead vuelve a escribir y sigue sin respuesta: aviso nuevo.
    msg(t, 1, 'lead', 16);
    expect(await checkSilentAi({ supabase: db as never, now, log: silentLog })).toMatchObject({
      enqueued: 1,
    });
    expect(t.notification_events).toHaveLength(2);
  });

  it('sin conversaciones mudas no escribe nada', async () => {
    const t = baseTables();
    conv(t, 1);
    msg(t, 1, 'lead', 30);
    msg(t, 1, 'ai', 29);
    expect(await checkSilentAi({ supabase: makeDb(t) as never, now, log: silentLog })).toEqual({
      silent: 0,
      enqueued: 0,
      skipped: 0,
      errors: 0,
    });
    expect(t.notification_events).toHaveLength(0);
  });
});

describe('processNotificationQueue — avisos técnicos a la agencia', () => {
  const okFetch = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend_admin_1' }),
      text: async () => '',
    } as Response);

  function queueTables(): Tables {
    return {
      notification_events: [
        {
          id: 1,
          tenant_id: 7,
          event_type: 'error_motor',
          status: 'pending',
          attempts: 0,
          next_attempt_at: minutesAgo(1),
          payload: {
            kind: 'ai_silent',
            threshold_minutes: 15,
            total_silent: 1,
            new_silent: 1,
            oldest_unanswered_at: minutesAgo(183),
            conversations: [
              { conversation_id: 13750, channel_type: 'instagram_dm', last_lead_message_id: 17505, last_lead_at: minutesAgo(183) },
            ],
          },
        },
      ],
      // Tania no tiene email configurado: aun así el aviso técnico tiene que salir.
      trainer_preferences: [{ tenant_id: 7, preferences: {} }],
      tenants: [{ id: 7, name: 'Tania Duarte de Matos' }],
      profiles: [
        { id: 'a', email: 'ops@fyzon.test', is_agency_admin: true, is_active: true },
        { id: 'b', email: 'trainer@example.test', is_agency_admin: false, is_active: true },
        { id: 'c', email: 'old-admin@fyzon.test', is_agency_admin: true, is_active: false },
      ],
    };
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
  });

  it('error_motor va a los agency admins activos, no al entrenador', async () => {
    const t = queueTables();
    const fetchImpl = okFetch();
    const res = await processNotificationQueue({ supabase: makeDb(t) as never, now, fetchImpl });

    expect(res).toMatchObject({ picked: 1, sent: 1, skipped: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchImpl.mock.calls[0]![1] as RequestInit).body));
    expect(body.to).toEqual(['ops@fyzon.test']);
    expect(body.subject).toContain('La IA no contesta en Tania Duarte de Matos');
    expect(body.html).toContain('/conversations/13750');
    expect(t.notification_events![0]).toMatchObject({ status: 'sent', resend_message_id: 'resend_admin_1' });
  });

  it('sin agency admin con email se marca como skipped, sin enviar', async () => {
    const t = queueTables();
    t.profiles = [];
    const fetchImpl = okFetch();
    const res = await processNotificationQueue({ supabase: makeDb(t) as never, now, fetchImpl });

    expect(res).toMatchObject({ picked: 1, sent: 0, skipped: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(t.notification_events![0]).toMatchObject({ status: 'skipped' });
  });
});
