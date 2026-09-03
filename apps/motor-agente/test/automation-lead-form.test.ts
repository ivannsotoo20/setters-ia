import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Tests del endpoint POST /automations/lead-form/:tenant_token (Hito 9 sub-fase 3).
 *
 * 6 escenarios:
 *   1. 404 si tenant_token inválido.
 *   2. 400 si phone inválido (no E.164).
 *   3. 409 si tenant sin welcome_template_id configurado.
 *   4. 200 happy path: crea lead WA, conv F1 outbound bienvenida, manda template via YCloud.
 *   5. 200 deduped si la misma combinación (tenant, phone) llega 2 veces en <60s.
 *   6. 401 si LEAD_FORM_VERIFY_MODE=enforce y X-Form-Secret missing/mismatch.
 *
 * Registro de formularios (`lead_form_submissions`, migración 077, 2026-09-03):
 *   7. Tally rechazado por reglas → fila con decision='rechazado' + motivo, sin lead.
 *   8. Tally aprobado por reglas → fila completada con lead_id/conversation_id/welcome_sent.
 *   9. Aprobado pero sin plantilla → fila con error, 409 como siempre.
 *  10. El INSERT del registro falla → el flujo sigue y la bienvenida sale igual.
 */

interface TenantTokenRow {
  token: string;
  tenant_id: number;
  purpose: string;
  is_active: boolean;
  revoked_at: string | null;
}
interface TenantConfigRow {
  tenant_id: number;
  welcome_template_id: number | null;
  /** Config del filtro de cualificación (lead-qualifier.ts). Ausente = sin filtro. */
  lead_qualification?: Record<string, unknown> | null;
}
interface SubmissionRow {
  id: number;
  tenant_id: number;
  phone: string | null;
  first_name: string | null;
  answers: Record<string, unknown>;
  decision: string;
  motivo: string | null;
  evaluado_por: string;
  lead_id: number | null;
  conversation_id: number | null;
  welcome_sent: boolean;
  error: string | null;
}
interface IntegrationAccountRow {
  id: number;
  tenant_id: number;
  provider: string;
  is_active: boolean;
  credentials: Record<string, unknown> | null;
  credentials_encrypted: unknown;
  connection_config: Record<string, unknown>;
  webhook_secret?: string;
}
interface TemplateRow {
  id: number;
  tenant_id: number;
  name: string;
  channel_kind: string;
  provider: string;
  body: string | null;
  provider_template_id: string | null;
  language: string | null;
  variables: Array<{ name: string; sample: string | null }>;
  status: string;
}
interface ChannelRow {
  id: number;
  tenant_id: number;
  channel_type: string;
  via_provider: string;
}
interface LeadRow {
  id: number;
  tenant_id: number;
  channel_id: number;
  external_id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}
interface ConversationRow {
  id: number;
  tenant_id: number;
  lead_id: number;
  channel_id: number;
  state: string;
  direction: string;
  phase_number: number;
  conversation_source: string | null;
  ai_paused_until: string | null;
}

const mocks = vi.hoisted(() => {
  const state = {
    tenantTokens: [] as TenantTokenRow[],
    tenantConfigs: [] as TenantConfigRow[],
    integrationAccounts: [] as IntegrationAccountRow[],
    templates: [] as TemplateRow[],
    channels: [] as ChannelRow[],
    leads: [] as LeadRow[],
    conversations: [] as ConversationRow[],
    messageInserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    conversationUpdates: [] as Array<{
      table: string;
      payload: Record<string, unknown>;
      filters: Array<[string, unknown]>;
    }>,
    iaUpdates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    submissions: [] as SubmissionRow[],
    submissionUpdates: [] as Array<{ id: number; payload: Record<string, unknown> }>,
    /** Simula que la tabla lead_form_submissions no existe / falla el INSERT. */
    failSubmissionInsert: false,
    dedupClaim: true,
    nextChannelId: 1,
    nextLeadId: 1,
    nextConversationId: 1,
    nextMessageId: 1,
    nextSubmissionId: 1,
  };

  function applyFilters(rows: Array<Record<string, unknown>>, filters: Array<[string, unknown, string?]>): Array<Record<string, unknown>> {
    let out = rows;
    for (const [col, val, op] of filters) {
      if (op === 'is_null') {
        out = out.filter((r) => r[col] == null);
      } else if (op === 'not_eq') {
        out = out.filter((r) => r[col] !== val);
      } else {
        out = out.filter((r) => r[col] === val);
      }
    }
    return out;
  }

  function makeSupabaseStub() {
    return {
      from(table: string) {
        const filters: Array<[string, unknown, string?]> = [];

        const builder = {
          select(_cols?: string) {
            return builder;
          },
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          is(col: string, val: unknown) {
            if (val == null) filters.push([col, null, 'is_null']);
            return builder;
          },
          not(col: string, _op: string, val: unknown) {
            filters.push([col, val, 'not_eq']);
            return builder;
          },
          order(_col: string, _opts?: { ascending?: boolean }) {
            return builder;
          },
          limit(_n: number) {
            return builder;
          },
          async maybeSingle<T>(): Promise<{ data: T | null; error: null }> {
            const rows = pickRows(table);
            const filtered = applyFilters(rows, filters);
            return { data: (filtered[0] as T) ?? null, error: null };
          },
          async single<T>(): Promise<{ data: T | null; error: null }> {
            const rows = pickRows(table);
            const filtered = applyFilters(rows, filters);
            return { data: (filtered[0] as T) ?? null, error: null };
          },
          insert(payload: Record<string, unknown>) {
            // Dos formas: insert(payload).select('id').single() — devolvemos thenable chainable.
            const thenableOnly = {
              select(_cols?: string) {
                // handleInsert puede lanzar (p.ej. failSubmissionInsert): se
                // devuelve como `error` igual que haría PostgREST.
                const run = () => {
                  try {
                    return { data: handleInsert(table, payload), error: null };
                  } catch (err) {
                    return {
                      data: null,
                      error: { message: err instanceof Error ? err.message : String(err) },
                    };
                  }
                };
                return {
                  async single() {
                    return run();
                  },
                  async maybeSingle() {
                    return run();
                  },
                };
              },
              then<T>(resolve: (v: { error: null }) => T) {
                handleInsert(table, payload);
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return thenableOnly;
          },
          update(payload: Record<string, unknown>) {
            const updateFilters: Array<[string, unknown]> = [];
            const updateBuilder = {
              eq(col: string, val: unknown) {
                updateFilters.push([col, val]);
                return updateBuilder;
              },
              then<T>(resolve: (v: { error: null }) => T) {
                if (table === 'conversations') {
                  state.conversationUpdates.push({ table, payload, filters: updateFilters });
                  // aplicamos al estado
                  const idFilter = updateFilters.find((f) => f[0] === 'id');
                  if (idFilter) {
                    const conv = state.conversations.find((c) => c.id === idFilter[1]);
                    if (conv) Object.assign(conv, payload);
                  }
                } else if (table === 'integration_accounts') {
                  state.iaUpdates.push({ table, payload });
                } else if (table === 'leads') {
                  // patch lead by id
                  const idFilter = updateFilters.find((f) => f[0] === 'id');
                  if (idFilter) {
                    const lead = state.leads.find((l) => l.id === idFilter[1]);
                    if (lead) Object.assign(lead, payload);
                  }
                } else if (table === 'lead_form_submissions') {
                  const idFilter = updateFilters.find((f) => f[0] === 'id');
                  if (idFilter) {
                    state.submissionUpdates.push({ id: idFilter[1] as number, payload });
                    const row = state.submissions.find((s) => s.id === idFilter[1]);
                    if (row) Object.assign(row, payload);
                  }
                }
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return updateBuilder;
          },
        };
        return builder;
      },
    };
  }

  function pickRows(table: string): Array<Record<string, unknown>> {
    switch (table) {
      case 'tenant_tokens':
        return state.tenantTokens as unknown as Array<Record<string, unknown>>;
      case 'tenant_configs':
        return state.tenantConfigs as unknown as Array<Record<string, unknown>>;
      case 'integration_accounts':
        return state.integrationAccounts as unknown as Array<Record<string, unknown>>;
      case 'followup_templates':
        return state.templates as unknown as Array<Record<string, unknown>>;
      case 'channels':
        return state.channels as unknown as Array<Record<string, unknown>>;
      case 'leads':
        return state.leads as unknown as Array<Record<string, unknown>>;
      case 'conversations':
        return state.conversations as unknown as Array<Record<string, unknown>>;
      case 'lead_form_submissions':
        return state.submissions as unknown as Array<Record<string, unknown>>;
      default:
        return [];
    }
  }

  function handleInsert(table: string, payload: Record<string, unknown>): Record<string, unknown> {
    if (table === 'channels') {
      const row: ChannelRow = {
        id: state.nextChannelId++,
        tenant_id: payload.tenant_id as number,
        channel_type: payload.channel_type as string,
        via_provider: payload.via_provider as string,
      };
      state.channels.push(row);
      return { id: row.id };
    }
    if (table === 'leads') {
      const row: LeadRow = {
        id: state.nextLeadId++,
        tenant_id: payload.tenant_id as number,
        channel_id: payload.channel_id as number,
        external_id: payload.external_id as string,
        phone: (payload.phone as string | null) ?? null,
        email: (payload.email as string | null) ?? null,
        first_name: (payload.first_name as string | null) ?? null,
        last_name: (payload.last_name as string | null) ?? null,
        username: (payload.username as string | null) ?? null,
      };
      state.leads.push(row);
      return { id: row.id };
    }
    if (table === 'conversations') {
      const row: ConversationRow = {
        id: state.nextConversationId++,
        tenant_id: payload.tenant_id as number,
        lead_id: payload.lead_id as number,
        channel_id: payload.channel_id as number,
        state: (payload.state as string) ?? 'active',
        direction: (payload.direction as string) ?? 'inbound',
        phase_number: (payload.phase_number as number) ?? 1,
        conversation_source: null,
        ai_paused_until: null,
      };
      state.conversations.push(row);
      return { id: row.id };
    }
    if (table === 'conversation_messages') {
      state.messageInserts.push({ table, payload });
      return { id: state.nextMessageId++ };
    }
    if (table === 'lead_form_submissions') {
      if (state.failSubmissionInsert) {
        throw new Error('relation "public.lead_form_submissions" does not exist');
      }
      const row: SubmissionRow = {
        id: state.nextSubmissionId++,
        tenant_id: payload.tenant_id as number,
        phone: (payload.phone as string | null) ?? null,
        first_name: (payload.first_name as string | null) ?? null,
        answers: (payload.answers as Record<string, unknown>) ?? {},
        decision: payload.decision as string,
        motivo: (payload.motivo as string | null) ?? null,
        evaluado_por: payload.evaluado_por as string,
        lead_id: null,
        conversation_id: null,
        welcome_sent: false,
        error: null,
      };
      state.submissions.push(row);
      return { id: row.id };
    }
    return {};
  }

  return {
    state,
    makeSupabaseStub,
    tryClaimDedupKeyMock: vi.fn(() => Promise.resolve(state.dedupClaim)),
    fetchMock: vi.fn(),
  };
});

vi.mock('../src/lib/supabase.js', () => ({
  getSupabase: () => mocks.makeSupabaseStub(),
}));
vi.mock('../src/lib/redis.js', () => ({
  tryClaimDedupKey: mocks.tryClaimDedupKeyMock,
  getRedis: () => ({}),
}));
// El evaluador IA no debe llamarse en estos tests: los casos de cualificación
// se resuelven por reglas deterministas. Si alguien lo llamara, el qualifier
// hace fail-open ('aprobado' / 'ninguno') y las aserciones sobre 'reglas' fallan.
vi.mock('../src/lib/anthropic.js', () => {
  const stub = {
    messages: {
      create: async () => {
        throw new Error('el evaluador IA no debe invocarse en este test');
      },
    },
  };
  return {
    getAnthropicForTenant: async () => stub,
    getAnthropic: () => stub,
  };
});

import { automationLeadFormRoutes } from '../src/routes/automation-lead-form.js';

let app: FastifyInstance;

beforeEach(async () => {
  const s = mocks.state;
  s.tenantTokens.length = 0;
  s.tenantConfigs.length = 0;
  s.integrationAccounts.length = 0;
  s.templates.length = 0;
  s.channels.length = 0;
  s.leads.length = 0;
  s.conversations.length = 0;
  s.messageInserts.length = 0;
  s.conversationUpdates.length = 0;
  s.iaUpdates.length = 0;
  s.submissions.length = 0;
  s.submissionUpdates.length = 0;
  s.failSubmissionInsert = false;
  s.dedupClaim = true;
  s.nextChannelId = 1;
  s.nextLeadId = 1;
  s.nextConversationId = 1;
  s.nextMessageId = 1;
  s.nextSubmissionId = 1;

  mocks.tryClaimDedupKeyMock.mockReset();
  mocks.tryClaimDedupKeyMock.mockImplementation(() => Promise.resolve(s.dedupClaim));
  mocks.fetchMock.mockReset();
  // Stub fetch global por defecto: success YCloud
  mocks.fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'accepted', wamid: 'wamid.HBg' }),
  } as Response);
  vi.stubGlobal('fetch', mocks.fetchMock);

  app = Fastify({ logger: false });
  await app.register(automationLeadFormRoutes);
  await app.ready();
});

describe('POST /automations/lead-form/:tenant_token', () => {
  it('404 si tenant_token inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/bad-token',
      payload: { phone: '+34600123456' },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain('tenant_token');
    expect(mocks.fetchMock).not.toHaveBeenCalled();
    expect(mocks.state.leads).toHaveLength(0);
  });

  it('400 si phone es inválido (no E.164)', async () => {
    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: { phone: 'not-a-phone-number' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_phone');
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('409 si tenant sin welcome_template_id configurado', async () => {
    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    mocks.state.tenantConfigs.push({ tenant_id: 2, welcome_template_id: null });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: { phone: '+34600123456', first_name: 'Juan' },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('no_welcome_template_configured');
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('200 happy path: crea lead WA, conv F1 outbound bienvenida, manda template YCloud', async () => {
    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    mocks.state.tenantConfigs.push({ tenant_id: 2, welcome_template_id: 10 });
    mocks.state.templates.push({
      id: 10,
      tenant_id: 2,
      name: 'bienvenida_pablo',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola, gracias por dejar tus datos',
      provider_template_id: 'bienvenida_pablo',
      language: 'es',
      variables: [],
      status: 'approved',
    });
    mocks.state.integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
      webhook_secret: 'test-secret',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      headers: { 'x-form-secret': 'test-secret' },
      payload: {
        phone: '+34600123456',
        first_name: 'Juan',
        source: 'vsl_pablo_octubre',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.tenant_id).toBe(2);
    expect(body.lead_id).toBeGreaterThan(0);
    expect(body.conversation_id).toBeGreaterThan(0);
    expect(body.provider_message_id).toBe('wamid.HBg');
    expect(body.lead_created).toBe(true);
    expect(body.source).toBe('vsl_pablo_octubre');

    // Lead persistido
    expect(mocks.state.leads).toHaveLength(1);
    expect(mocks.state.leads[0]!.phone).toBe('+34600123456');
    expect(mocks.state.leads[0]!.first_name).toBe('Juan');
    // Channel WA via ycloud creado
    expect(mocks.state.channels).toHaveLength(1);
    expect(mocks.state.channels[0]!.channel_type).toBe('whatsapp');
    expect(mocks.state.channels[0]!.via_provider).toBe('ycloud');
    // Conversation creada
    expect(mocks.state.conversations).toHaveLength(1);
    // sendWelcomeTemplate insertó message ai
    const aiMsg = mocks.state.messageInserts.find((m) => m.payload.source === 'ai');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.payload.content).toContain('Hola');
    // sendWelcomeTemplate UPDATEó conversation a F1 outbound bienvenida
    const convUpd = mocks.state.conversationUpdates.find(
      (u) => u.payload.conversation_source === 'bienvenida',
    );
    expect(convUpd).toBeDefined();
    expect(convUpd!.payload.direction).toBe('outbound');
    expect(convUpd!.payload.phase_number).toBe(1);
    expect(convUpd!.payload.ai_paused_until).toBeNull();
    // last_webhook_at touched
    expect(mocks.state.iaUpdates.length).toBeGreaterThan(0);
    // YCloud llamado con el payload correcto
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v2/whatsapp/messages/sendDirectly');
    const sentBody = JSON.parse(String((init as RequestInit).body));
    expect(sentBody.template.name).toBe('bienvenida_pablo');
  });

  it('200 deduped si mismo (tenant, phone) llega 2 veces (Redis SETNX falla 2do)', async () => {
    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    // Forzamos dedup → false (ya claimed)
    mocks.state.dedupClaim = false;
    mocks.tryClaimDedupKeyMock.mockResolvedValue(false);

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: { phone: '+34600123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(true);
    // No side effects
    expect(mocks.state.leads).toHaveLength(0);
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('401 si LEAD_FORM_VERIFY_MODE=enforce y X-Form-Secret missing', async () => {
    process.env.LEAD_FORM_VERIFY_MODE = 'enforce';
    // Re-importar env para pillar el cambio. En la práctica vitest cachea modules.
    // Workaround: vi.resetModules + dynamic import del route.
    vi.resetModules();
    const { automationLeadFormRoutes: fresh } = await import(
      '../src/routes/automation-lead-form.js'
    );
    const app2 = Fastify({ logger: false });
    await app2.register(fresh);
    await app2.ready();

    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    mocks.state.integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
      webhook_secret: 'expected-secret',
    });

    const res = await app2.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      // sin header X-Form-Secret
      payload: { phone: '+34600123456' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('missing_secret');
    expect(mocks.fetchMock).not.toHaveBeenCalled();

    // Cleanup
    delete process.env.LEAD_FORM_VERIFY_MODE;
  });

  it('401 si X-Form-Secret incorrecto pero de misma longitud (timing-safe compare)', async () => {
    // Hardening 2026-05-15 / Parche Hito 9: la comparación de X-Form-Secret debe
    // usar isValidBearer (crypto.timingSafeEqual) en vez de !==. Este test fuerza
    // misma longitud + diferente contenido para garantizar que el chequeo se hace
    // a través del helper constant-time (caso que un `===` plain también
    // rechazaría, pero queremos blindar contra regresiones futuras al patrón).
    process.env.LEAD_FORM_VERIFY_MODE = 'enforce';
    vi.resetModules();
    const { automationLeadFormRoutes: fresh } = await import(
      '../src/routes/automation-lead-form.js'
    );
    const app2 = Fastify({ logger: false });
    await app2.register(fresh);
    await app2.ready();

    const expected = 'expected-secret-32-chars-padding!';
    const provided = 'expected-secret-32-chars-DIFFERR!'; // misma longitud
    expect(provided.length).toBe(expected.length); // sanity-check

    mocks.state.tenantTokens.push({
      token: 'good-token',
      tenant_id: 2,
      purpose: 'lead_form_webhook',
      is_active: true,
      revoked_at: null,
    });
    mocks.state.integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
      webhook_secret: expected,
    });

    const res = await app2.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      headers: { 'X-Form-Secret': provided },
      payload: { phone: '+34600123456' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('invalid_secret');
    expect(mocks.fetchMock).not.toHaveBeenCalled();

    delete process.env.LEAD_FORM_VERIFY_MODE;
  });
});

// ----------------------------------------------------------------------------
// Registro de formularios — lead_form_submissions (migración 077, 2026-09-03)
// ----------------------------------------------------------------------------

/** Config de cualificación mínima: rechaza "Menos de 3 meses", aprueba país Tier A. */
const QUALIFICATION_CONFIG = {
  enabled: true,
  pain_reject_values: ['Menos de 3 meses'],
  country_label_regex: 'vives|pais|país',
  ai_criteria: 'Eres un evaluador. (no debe llegar a usarse en estos tests)',
};

/** Tenant listo para enviar bienvenida (token + plantilla + cuenta YCloud). */
function seedReadyTenant(opts: { welcomeTemplateId: number | null; qualification?: unknown }) {
  mocks.state.tenantTokens.push({
    token: 'good-token',
    tenant_id: 2,
    purpose: 'lead_form_webhook',
    is_active: true,
    revoked_at: null,
  });
  mocks.state.tenantConfigs.push({
    tenant_id: 2,
    welcome_template_id: opts.welcomeTemplateId,
    lead_qualification: (opts.qualification as Record<string, unknown> | null | undefined) ?? null,
  });
  mocks.state.templates.push({
    id: 10,
    tenant_id: 2,
    name: 'bienvenida_tania',
    channel_kind: 'whatsapp',
    provider: 'ycloud',
    body: 'Hola, gracias por dejar tus datos',
    provider_template_id: 'bienvenida_tania',
    language: 'es',
    variables: [],
    status: 'approved',
  });
  mocks.state.integrationAccounts.push({
    id: 7,
    tenant_id: 2,
    provider: 'ycloud',
    is_active: true,
    credentials: { api_key: 'ycloud-test' },
    credentials_encrypted: null,
    connection_config: { business_phone: '+34611223344' },
  });
}

/** Webhook nativo de Tally (FORM_RESPONSE) con las 4 preguntas que usan las reglas. */
function tallyBody(opts: { pain: string; country: string }) {
  return {
    eventId: 'evt_1',
    eventType: 'FORM_RESPONSE',
    data: {
      responseId: 'resp_1',
      fields: [
        { key: 'q_name', label: 'Nombre y apellidos', type: 'INPUT_TEXT', value: 'Ana García' },
        { key: 'q_phone', label: 'Teléfono', type: 'INPUT_PHONE_NUMBER', value: '+34600123456' },
        {
          key: 'q_pain',
          label: '¿Desde cuándo tienes dolor?',
          type: 'MULTIPLE_CHOICE',
          value: ['opt_a'],
          options: [{ id: 'opt_a', text: opts.pain }],
        },
        { key: 'q_country', label: '¿En qué país vives?', type: 'INPUT_TEXT', value: opts.country },
      ],
    },
  };
}

describe('lead_form_submissions — registro del veredicto para el panel', () => {
  it('rechazado por reglas → fila con decision/motivo/respuestas, sin lead ni bienvenida', async () => {
    seedReadyTenant({ welcomeTemplateId: 10, qualification: QUALIFICATION_CONFIG });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: tallyBody({ pain: 'Menos de 3 meses', country: 'México' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.qualified).toBe(false);
    expect(body.decision).toBe('rechazado');
    expect(body.evaluado_por).toBe('reglas');

    // La fila queda escrita con el veredicto…
    expect(mocks.state.submissions).toHaveLength(1);
    const row = mocks.state.submissions[0]!;
    expect(row.tenant_id).toBe(2);
    expect(row.phone).toBe('+34600123456');
    expect(row.first_name).toBe('Ana');
    expect(row.decision).toBe('rechazado');
    expect(row.evaluado_por).toBe('reglas');
    expect(row.motivo).toContain('Menos de 3 meses');
    expect(row.answers['¿Desde cuándo tienes dolor?']).toBe('Menos de 3 meses');
    expect(row.answers['¿En qué país vives?']).toBe('México');
    expect(row.welcome_sent).toBe(false);
    expect(row.lead_id).toBeNull();
    expect(row.conversation_id).toBeNull();
    // …y no hay ningún UPDATE posterior, porque el flujo termina aquí.
    expect(mocks.state.submissionUpdates).toHaveLength(0);
    expect(mocks.state.leads).toHaveLength(0);
    expect(mocks.state.conversations).toHaveLength(0);
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('aprobado por reglas → la fila se completa con lead_id, conversation_id y welcome_sent=true', async () => {
    seedReadyTenant({ welcomeTemplateId: 10, qualification: QUALIFICATION_CONFIG });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: tallyBody({ pain: 'Más de 1 año', country: 'España' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.lead_id).toBe(1);
    expect(body.conversation_id).toBe(1);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);

    expect(mocks.state.submissions).toHaveLength(1);
    const row = mocks.state.submissions[0]!;
    expect(row.decision).toBe('aprobado');
    expect(row.evaluado_por).toBe('reglas');
    expect(row.motivo).toContain('contacto garantizado');
    expect(row.lead_id).toBe(1);
    expect(row.conversation_id).toBe(1);
    expect(row.welcome_sent).toBe(true);
    expect(row.error).toBeNull();

    // El UPDATE final lleva exactamente el cierre del flujo.
    const last = mocks.state.submissionUpdates.at(-1)!;
    expect(last.id).toBe(1);
    expect(last.payload).toMatchObject({
      lead_id: 1,
      conversation_id: 1,
      welcome_sent: true,
      error: null,
    });
  });

  it('aprobado pero sin plantilla de bienvenida → 409 y la fila guarda el error', async () => {
    seedReadyTenant({ welcomeTemplateId: null, qualification: QUALIFICATION_CONFIG });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: tallyBody({ pain: 'Más de 1 año', country: 'España' }),
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe('no_welcome_template_configured');

    expect(mocks.state.submissions).toHaveLength(1);
    const row = mocks.state.submissions[0]!;
    expect(row.decision).toBe('aprobado');
    expect(row.welcome_sent).toBe(false);
    expect(row.error).toBe('no_welcome_template_configured');
    expect(row.lead_id).toBeNull();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it('si el INSERT del registro falla, el lead se crea y la bienvenida sale igual', async () => {
    seedReadyTenant({ welcomeTemplateId: 10, qualification: QUALIFICATION_CONFIG });
    mocks.state.failSubmissionInsert = true;

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: tallyBody({ pain: 'Más de 1 año', country: 'España' }),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(mocks.state.leads).toHaveLength(1);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    // Sin fila no hay id, y los patch posteriores son no-op.
    expect(mocks.state.submissions).toHaveLength(0);
    expect(mocks.state.submissionUpdates).toHaveLength(0);
  });

  it('payload plano sin respuestas (GHL Workflow) → fila sin_filtro/ninguno con la bienvenida enviada', async () => {
    seedReadyTenant({ welcomeTemplateId: 10 });

    const res = await app.inject({
      method: 'POST',
      url: '/automations/lead-form/good-token',
      payload: { phone: '+34600123456', first_name: 'Juan' },
    });
    expect(res.statusCode).toBe(200);

    expect(mocks.state.submissions).toHaveLength(1);
    const row = mocks.state.submissions[0]!;
    expect(row.decision).toBe('sin_filtro');
    expect(row.evaluado_por).toBe('ninguno');
    expect(row.motivo).toBeNull();
    expect(row.answers).toEqual({});
    expect(row.first_name).toBe('Juan');
    expect(row.welcome_sent).toBe(true);
    expect(row.lead_id).toBe(1);
  });
});
