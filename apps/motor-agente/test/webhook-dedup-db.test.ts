import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * 2026-10-20 — antiduplicado de webhooks en la base de datos (migration 080).
 *
 * Incidente 17-20 oct: con Redis caído (dedup fail-open) y los reintentos de
 * YCloud (hasta ~5,5 h) y GHL (hasta +10h54m), cada reintento se guardó otra
 * vez: 774 filas duplicadas en el tenant 7. Estos tests pasan por las rutas
 * reales con Redis "olvidadizo" (el claim siempre devuelve true, como con el
 * TTL vencido o Redis caído) y comprueban que la base de datos para el
 * reintento sin encolar otro turno de la IA.
 */

interface Call {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, unknown, unknown]>;
}

type Result = { data: unknown; error: unknown };
type Handler = (call: Call) => Result;

const mocks = vi.hoisted(() => {
  const state: { handler: (call: unknown) => unknown; calls: unknown[] } = {
    handler: () => ({ data: null, error: null }),
    calls: [],
  };

  /** Query builder encadenable y "thenable": resuelve con el handler del test. */
  function makeSupabaseStub() {
    return {
      from(table: string) {
        const call = { table, op: 'select', filters: [] as Array<[string, unknown, unknown]> } as {
          table: string;
          op: string;
          payload?: unknown;
          options?: unknown;
          filters: Array<[string, unknown, unknown]>;
        };
        let opSet = false;
        const b: Record<string, unknown> = {};
        const setOp = (op: string, payload?: unknown, options?: unknown) => {
          if (!opSet) {
            call.op = op;
            call.payload = payload;
            call.options = options;
            opSet = true;
          }
          return b;
        };
        b.select = () => {
          opSet = true;
          return b;
        };
        b.insert = (p: unknown) => setOp('insert', p);
        b.upsert = (p: unknown, o: unknown) => setOp('upsert', p, o);
        b.update = (p: unknown) => setOp('update', p);
        b.delete = () => setOp('delete');
        for (const m of ['eq', 'neq', 'is', 'not', 'in', 'gte', 'lte', 'gt', 'lt']) {
          b[m] = (col: unknown, val: unknown) => {
            call.filters.push([m, col, val]);
            return b;
          };
        }
        for (const m of ['order', 'limit', 'range', 'maybeSingle', 'single', 'abortSignal']) {
          b[m] = () => b;
        }
        b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          state.calls.push(call);
          try {
            resolve(state.handler(call));
          } catch (err) {
            reject(err);
          }
        };
        return b;
      },
    };
  }

  return {
    state,
    makeSupabaseStub,
    zadd: vi.fn(() => Promise.resolve(1)),
  };
});

vi.mock('../src/lib/supabase.js', () => ({
  getSupabase: () => mocks.makeSupabaseStub(),
}));

// Redis "olvidadizo": el claim nunca ve el duplicado (TTL vencido o Redis caído).
vi.mock('../src/lib/redis.js', () => ({
  tryClaimDedupKey: () => Promise.resolve(true),
  getRedis: () => ({ zadd: mocks.zadd }),
}));

const { webhookYCloudRoutes } = await import('../src/routes/webhook-ycloud.js');
const { webhookGhlRoutes } = await import('../src/routes/webhook-ghl.js');
const { clearDeferredDebounces } = await import('../src/lib/debounce-buffer.js');

function calls(): Call[] {
  return mocks.state.calls as Call[];
}
function messageWrites(): Call[] {
  return calls().filter(
    (c) => c.table === 'conversation_messages' && (c.op === 'insert' || c.op === 'upsert'),
  );
}

const ok = (data: unknown): Result => ({ data, error: null });

/** Respuestas "normales" de las tablas que tocan los webhooks. */
function baseHandler(call: Call): Result | undefined {
  switch (call.table) {
    case 'tenant_tokens':
      return ok({ id: 1, tenant_id: 7, is_active: true, purpose: 'ycloud_webhook', revoked_at: null });
    case 'tenant_configs':
      return ok({ wa_inbound_mode: 'all', debounce_window_seconds: 25, ghl_inbound_mode: 'all' });
    case 'channels':
      return ok({ id: 3 });
    case 'leads':
      return call.op === 'select' ? ok({ id: 11, timezone: 'Europe/Madrid' }) : ok(null);
    case 'conversations':
      return call.op === 'select'
        ? ok({ id: 13886, ai_paused_until: null, conversation_source: 'inbound', ghl_contact_id: 'c1', ghl_conversation_id: 'gc1' })
        : ok(null);
    case 'integration_accounts':
      if (call.op === 'update') return ok(null);
      return ok(null);
    case 'automation_keywords':
      return ok([]);
    default:
      return undefined;
  }
}

function useHandler(scenario: (call: Call) => Result | undefined): void {
  mocks.state.handler = (raw: unknown) => {
    const call = raw as Call;
    const scenarioResult = scenario(call);
    if (scenarioResult) return scenarioResult;
    const base = baseHandler(call);
    if (base) return base;
    return ok(null);
  };
}

const ycloudPayload = {
  id: 'evt_1',
  type: 'whatsapp.inbound_message.received',
  whatsappInboundMessage: {
    id: 'wamid.HBgLMzQ2MDAwMDAwMDA',
    from: '34600000000',
    to: '34911111111',
    type: 'text',
    text: { body: 'Espalda' },
  },
};

async function buildApp(register: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(register);
  return app;
}

beforeEach(() => {
  mocks.state.calls = [];
  mocks.zadd.mockClear();
  clearDeferredDebounces();
});

describe('webhook YCloud — antiduplicado en BD', () => {
  it('reintento tardío (Redis ya no lo recuerda): 200 deduped, sin guardar otra fila ni encolar', async () => {
    useHandler((call) =>
      call.table === 'conversation_messages' && call.op === 'select'
        ? ok({ id: 900, conversation_id: 13886 })
        : undefined,
    );
    const app = await buildApp(webhookYCloudRoutes);
    const res = await app.inject({ method: 'POST', url: '/webhook/ycloud/tok', payload: ycloudPayload });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: true, conversation_id: 13886 });
    expect(messageWrites()).toHaveLength(0);
    expect(mocks.zadd).not.toHaveBeenCalled();
    // Ni lead ni conversación: el reintento no toca nada.
    expect(calls().some((c) => c.table === 'leads' || c.table === 'channels')).toBe(false);

    const lookup = calls().find((c) => c.table === 'conversation_messages' && c.op === 'select')!;
    expect(lookup.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', 7],
        ['eq', 'provider', 'ycloud'],
        ['eq', 'provider_message_id', 'wamid.HBgLMzQ2MDAwMDAwMDA'],
      ]),
    );
  });

  it('primera entrega: INSERT con provider + id y ON CONFLICT DO NOTHING; encola el debounce', async () => {
    useHandler((call) => {
      if (call.table !== 'conversation_messages') return undefined;
      if (call.op === 'select') return ok(null);
      if (call.op === 'upsert') return ok([{ id: 901 }]);
      return undefined;
    });
    const app = await buildApp(webhookYCloudRoutes);
    const res = await app.inject({ method: 'POST', url: '/webhook/ycloud/tok', payload: ycloudPayload });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: false, message_id: 901 });

    const [write] = messageWrites();
    expect(write!.op).toBe('upsert');
    expect(write!.options).toEqual({
      onConflict: 'tenant_id,provider,provider_message_id',
      ignoreDuplicates: true,
    });
    expect((write!.payload as Array<Record<string, unknown>>)[0]).toMatchObject({
      source: 'lead',
      content: 'Espalda',
      provider: 'ycloud',
      provider_message_id: 'wamid.HBgLMzQ2MDAwMDAwMDA',
    });
    expect(mocks.zadd).toHaveBeenCalledTimes(1);
    expect(mocks.zadd.mock.calls[0]).toEqual(
      expect.arrayContaining(['fyzon:debounce:conversations', '13886']),
    );
  });

  it('dos entregas a la vez: la que pierde el ON CONFLICT contesta deduped y no encola', async () => {
    useHandler((call) => {
      if (call.table !== 'conversation_messages') return undefined;
      if (call.op === 'select') return ok(null);
      if (call.op === 'upsert') return ok([]); // DO NOTHING: no devuelve filas
      return undefined;
    });
    const app = await buildApp(webhookYCloudRoutes);
    const res = await app.inject({ method: 'POST', url: '/webhook/ycloud/tok', payload: ycloudPayload });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: true });
    expect(mocks.zadd).not.toHaveBeenCalled();
    // Tampoco se toca last_message_at: el mensaje no es nuevo.
    expect(calls().some((c) => c.table === 'conversations' && c.op === 'update')).toBe(false);
  });

  it('sin la migration 080 aplicada el mensaje se guarda igual (sin antiduplicado) y se encola', async () => {
    useHandler((call) => {
      if (call.table !== 'conversation_messages') return undefined;
      if (call.op === 'select') {
        return { data: null, error: { code: '42703', message: 'column conversation_messages.provider does not exist' } };
      }
      if (call.op === 'upsert') {
        return {
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'provider' column of 'conversation_messages' in the schema cache" },
        };
      }
      if (call.op === 'insert') return ok([{ id: 902 }]);
      return undefined;
    });
    const app = await buildApp(webhookYCloudRoutes);
    const res = await app.inject({ method: 'POST', url: '/webhook/ycloud/tok', payload: ycloudPayload });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: false, message_id: 902 });
    const insert = messageWrites().find((c) => c.op === 'insert')!;
    const row = (insert.payload as Array<Record<string, unknown>>)[0]!;
    expect(row).not.toHaveProperty('provider');
    expect(row).not.toHaveProperty('provider_message_id');
    expect(mocks.zadd).toHaveBeenCalledTimes(1);
  });
});

describe('webhook GHL (App Marketplace) — antiduplicado en BD', () => {
  const ghlHandler = (stored: boolean) => (call: Call): Result | undefined => {
    if (call.table === 'integration_accounts' && call.op === 'select') {
      // resolveTenantByOauthLocation + loadGhlClient (sin credenciales → sin cliente)
      return ok([
        { id: 5, tenant_id: 7, connection_config: { auth_type: 'oauth', locationId: 'loc_7' } },
      ]);
    }
    if (call.table === 'conversation_messages' && call.op === 'select') {
      return ok(stored ? { id: 777, conversation_id: 13745 } : null);
    }
    return undefined;
  };

  const ghlPayload = (type: 'InboundMessage' | 'OutboundMessage') => ({
    type,
    locationId: 'loc_7',
    contactId: 'contact_1',
    conversationId: 'gc1',
    body: 'En general me canso más',
    messageType: 'IG',
    direction: type === 'InboundMessage' ? 'inbound' : 'outbound',
    messageId: 'ghl_msg_1',
  });

  it('InboundMessage reintentado a las 10 h: 200 deduped, sin guardar ni encolar', async () => {
    useHandler(ghlHandler(true));
    const app = await buildApp(webhookGhlRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/integrations/webhook/oauth',
      payload: ghlPayload('InboundMessage'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: true, tenant_id: 7, conversation_id: 13745 });
    expect(messageWrites()).toHaveLength(0);
    expect(mocks.zadd).not.toHaveBeenCalled();
    const lookup = calls().find((c) => c.table === 'conversation_messages' && c.op === 'select')!;
    expect(lookup.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'provider', 'ghl'],
        ['eq', 'provider_message_id', 'ghl_msg_1'],
      ]),
    );
  });

  it('OutboundMessage humano reintentado: no vuelve a pausar la IA ni guarda otra fila', async () => {
    useHandler(ghlHandler(true));
    const app = await buildApp(webhookGhlRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/integrations/webhook/oauth',
      payload: ghlPayload('OutboundMessage'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, deduped: true });
    expect(messageWrites()).toHaveLength(0);
    expect(calls().some((c) => c.table === 'conversations' && c.op === 'update')).toBe(false);
  });

  it('InboundMessage nuevo: las filas llevan el messageId de GHL y se encola el debounce', async () => {
    useHandler((call) => {
      const r = ghlHandler(false)(call);
      if (r) return r;
      if (call.table === 'conversation_messages' && call.op === 'upsert') return ok([{ id: 950 }]);
      return undefined;
    });
    const app = await buildApp(webhookGhlRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/integrations/webhook/oauth',
      payload: { ...ghlPayload('InboundMessage'), attachments: ['https://cdn.example/a.jpg'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ack: true, type: 'InboundMessage', messageId: 950, duplicate: false });
    const [write] = messageWrites();
    const rows = write!.payload as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.provider_message_id)).toEqual(['ghl_msg_1', 'ghl_msg_1:1']);
    expect(rows.every((r) => r.provider === 'ghl')).toBe(true);
    expect(mocks.zadd).toHaveBeenCalledTimes(1);
  });
});
