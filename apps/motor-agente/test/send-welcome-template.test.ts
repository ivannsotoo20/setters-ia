import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  interpolateTemplateBody,
  resolveTemplateVariable,
  sendWelcomeTemplate,
  WelcomeTemplateError,
} from '../src/services/send-welcome-template.js';

/**
 * Tests del service send-welcome-template (Hito 9 sub-fase 2 + Parche Hito 9).
 *
 * Escenarios:
 *   1. Happy path: template OK + ycloud OK + lead OK → llama ycloudSendTemplate,
 *      INSERT message source='ai', UPDATE conversation a F1 outbound bienvenida.
 *   2. Template no existe → throws reason='template_not_found' httpStatus=404.
 *   3. No integration_account ycloud → throws reason='no_ycloud_account' httpStatus=409.
 *   4. YCloud responde 401 → throws reason='send_failed' httpStatus=502.
 *   5. Variable con name='nombre' + lead.first_name='Iván' → bodyVariable='Iván'.
 *   6. Variable sin name (solo sample) → fallback al sample registrado.
 *   7. resolveTemplateVariable unit tests (mapping name → campo lead).
 */

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

interface LeadRow {
  id: number;
  tenant_id: number;
  external_id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface IntegrationAccountRow {
  id: number;
  tenant_id: number;
  provider: string;
  is_active: boolean;
  credentials: Record<string, unknown> | null;
  credentials_encrypted: unknown;
  connection_config: Record<string, unknown>;
}

interface InsertedMessage {
  table: string;
  payload: Record<string, unknown>;
}

interface UpdatedConversation {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

let templates: TemplateRow[];
let leads: LeadRow[];
let integrationAccounts: IntegrationAccountRow[];
let inserts: InsertedMessage[];
let updates: UpdatedConversation[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  templates = [];
  leads = [];
  integrationAccounts = [];
  inserts = [];
  updates = [];
  fetchMock = vi.fn();
});

function makeSupabaseStub() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];

      const builder = {
        select(_cols?: string) {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        order(_col: string, _opts?: { ascending?: boolean }) {
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        async maybeSingle<T>(): Promise<{ data: T | null; error: null }> {
          let rows: Array<Record<string, unknown>>;
          if (table === 'followup_templates') rows = templates as unknown as Array<Record<string, unknown>>;
          else if (table === 'leads') rows = leads as unknown as Array<Record<string, unknown>>;
          else if (table === 'integration_accounts') {
            rows = integrationAccounts as unknown as Array<Record<string, unknown>>;
          } else rows = [];
          for (const [col, val] of filters) {
            rows = rows.filter((r) => r[col] === val);
          }
          return { data: (rows[0] as T) ?? null, error: null };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null }) as unknown as ReturnType<
            typeof builder.maybeSingle
          >;
        },
        update(payload: Record<string, unknown>) {
          // chainable .eq().eq() that finally resolves
          const updateFilters: Array<[string, unknown]> = [];
          const updateBuilder = {
            eq(col: string, val: unknown) {
              updateFilters.push([col, val]);
              return updateBuilder;
            },
            then<T>(resolve: (v: { error: null }) => T) {
              updates.push({ table, payload, filters: updateFilters });
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

describe('sendWelcomeTemplate', () => {
  it('happy path: envía template via YCloud, INSERTa message ai y UPDATEa conversation a F1', async () => {
    templates.push({
      id: 10,
      tenant_id: 2,
      name: 'bienvenida_pablo_v1',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola {{1}}, bienvenido a Montefit',
      provider_template_id: 'bienvenida_pablo_v1',
      language: 'es',
      variables: [{ name: '1', sample: 'Juan' }],
      status: 'approved',
    });
    leads.push({
      id: 100,
      tenant_id: 2,
      external_id: '+34600123456',
      phone: '+34600123456',
      first_name: 'Juan',
      last_name: null,
    });
    integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test-key' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'accepted', wamid: 'wamid.HBg' }),
    } as Response);

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    const result = await sendWelcomeTemplate({
      supabase,
      tenantId: 2,
      leadId: 100,
      conversationId: 555,
      templateId: 10,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.providerMessageId).toBe('wamid.HBg');
    expect(result.status).toBe('accepted');
    expect(result.templateName).toBe('bienvenida_pablo_v1');
    expect(result.bodyText).toContain('Hola');

    // Verifica payload enviado a YCloud
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v2/whatsapp/messages/sendDirectly');
    const sentBody = JSON.parse(String((init as RequestInit).body));
    expect(sentBody.from).toBe('+34611223344');
    expect(sentBody.to).toBe('+34600123456');
    expect(sentBody.template.name).toBe('bienvenida_pablo_v1');
    expect(sentBody.template.language.code).toBe('es');
    expect(sentBody.template.components[0].parameters[0].text).toBe('Juan');

    // INSERT conversation_messages — body INTERPOLADO (Parche Hito 9 2.1).
    // El template raw es "Hola {{1}}, bienvenido a Montefit", el lead.first_name='Juan',
    // así que en BD debe persistirse "Hola Juan, bienvenido a Montefit" (sin {{1}} literal).
    const msgInsert = inserts.find((i) => i.table === 'conversation_messages');
    expect(msgInsert).toBeDefined();
    expect(msgInsert!.payload.tenant_id).toBe(2);
    expect(msgInsert!.payload.conversation_id).toBe(555);
    expect(msgInsert!.payload.source).toBe('ai');
    expect(msgInsert!.payload.content).toBe('Hola Juan, bienvenido a Montefit');
    expect(msgInsert!.payload.content).not.toContain('{{');

    // UPDATE conversations a F1 outbound bienvenida
    const convUpdate = updates.find((u) => u.table === 'conversations');
    expect(convUpdate).toBeDefined();
    expect(convUpdate!.payload.direction).toBe('outbound');
    expect(convUpdate!.payload.conversation_source).toBe('bienvenida');
    expect(convUpdate!.payload.phase_number).toBe(1);
    expect(convUpdate!.payload.ai_paused_until).toBeNull();
    // Filtros eq id=555 + eq tenant_id=2
    const cols = convUpdate!.filters.map((f) => f[0]);
    expect(cols).toContain('id');
    expect(cols).toContain('tenant_id');
  });

  it('throws template_not_found si templateId no existe', async () => {
    leads.push({
      id: 100,
      tenant_id: 2,
      external_id: '+34600123456',
      phone: '+34600123456',
      first_name: 'Juan',
      last_name: null,
    });
    integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test-key' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
    });

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    await expect(
      sendWelcomeTemplate({
        supabase,
        tenantId: 2,
        leadId: 100,
        conversationId: 555,
        templateId: 9999,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'WelcomeTemplateError',
      reason: 'template_not_found',
      httpStatus: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('throws no_ycloud_account si tenant no tiene integration_account ycloud activa', async () => {
    templates.push({
      id: 10,
      tenant_id: 2,
      name: 'bienvenida_pablo_v1',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola',
      provider_template_id: 'bienvenida_pablo_v1',
      language: 'es',
      variables: [],
      status: 'approved',
    });
    leads.push({
      id: 100,
      tenant_id: 2,
      external_id: '+34600123456',
      phone: '+34600123456',
      first_name: null,
      last_name: null,
    });
    // NO ycloud account.

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    await expect(
      sendWelcomeTemplate({
        supabase,
        tenantId: 2,
        leadId: 100,
        conversationId: 555,
        templateId: 10,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'WelcomeTemplateError',
      reason: 'no_ycloud_account',
      httpStatus: 409,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws send_failed con httpStatus=502 si YCloud responde 401', async () => {
    templates.push({
      id: 10,
      tenant_id: 2,
      name: 'bienvenida_pablo_v1',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola',
      provider_template_id: 'bienvenida_pablo_v1',
      language: 'es',
      variables: [],
      status: 'approved',
    });
    leads.push({
      id: 100,
      tenant_id: 2,
      external_id: '+34600123456',
      phone: '+34600123456',
      first_name: null,
      last_name: null,
    });
    integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-bad-key' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'unauthorized' }),
    } as Response);

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    let caught: unknown;
    try {
      await sendWelcomeTemplate({
        supabase,
        tenantId: 2,
        leadId: 100,
        conversationId: 555,
        templateId: 10,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WelcomeTemplateError);
    const e = caught as WelcomeTemplateError;
    expect(e.reason).toBe('send_failed');
    expect(e.httpStatus).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No INSERT message en este caso (failed antes de persistir)
    expect(inserts).toHaveLength(0);
  });

  it('variable name=nombre + lead.first_name interpolado en bodyVariables (no sample literal)', async () => {
    // Parche Hito 9 — antes el code mapeaba `bodyVariables = variables.map(v => v.sample)`
    // por lo que el lead siempre recibía el sample (ej. "Pepe") en vez de su nombre real.
    // Este test fuerza el caso plantilla `{{nombre}}` y verifica que el bodyVariable
    // enviado a YCloud es el `first_name` del lead, no el sample.
    templates.push({
      id: 10,
      tenant_id: 2,
      name: 'bienvenidas.es',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola {{nombre}}, bienvenido a Fyzon',
      provider_template_id: 'bienvenidas',
      language: 'es',
      variables: [{ name: 'nombre', sample: 'Pepe' }],
      status: 'approved',
    });
    leads.push({
      id: 100,
      tenant_id: 2,
      external_id: '+34600123456',
      phone: '+34600123456',
      first_name: 'Iván',
      last_name: 'Soto',
    });
    integrationAccounts.push({
      id: 7,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'accepted', wamid: 'wamid.parche2' }),
    } as Response);

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    await sendWelcomeTemplate({
      supabase,
      tenantId: 2,
      leadId: 100,
      conversationId: 555,
      templateId: 10,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse(String((init as RequestInit).body));
    expect(sentBody.template.components[0].parameters[0].text).toBe('Iván');
    expect(sentBody.template.components[0].parameters[0].text).not.toBe('Pepe');
  });

  it('variable sin name cae al sample (regresión)', async () => {
    // Si la plantilla en BD viene con variables sin `name` (legacy o sync defectuoso),
    // el helper debe usar el sample. No debe romper.
    templates.push({
      id: 11,
      tenant_id: 2,
      name: 'legacy.es',
      channel_kind: 'whatsapp',
      provider: 'ycloud',
      body: 'Hola {{1}}',
      provider_template_id: 'legacy',
      language: 'es',
      variables: [{ name: null as unknown as string, sample: 'FALLBACK' }],
      status: 'approved',
    });
    leads.push({
      id: 101,
      tenant_id: 2,
      external_id: '+34600999888',
      phone: '+34600999888',
      first_name: 'Iván',
      last_name: null,
    });
    integrationAccounts.push({
      id: 8,
      tenant_id: 2,
      provider: 'ycloud',
      is_active: true,
      credentials: { api_key: 'ycloud-test' },
      credentials_encrypted: null,
      connection_config: { business_phone: '+34611223344' },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'accepted', wamid: 'wamid.fallback' }),
    } as Response);

    const supabase = makeSupabaseStub() as unknown as Parameters<typeof sendWelcomeTemplate>[0]['supabase'];
    await sendWelcomeTemplate({
      supabase,
      tenantId: 2,
      leadId: 101,
      conversationId: 556,
      templateId: 11,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse(String((init as RequestInit).body));
    expect(sentBody.template.components[0].parameters[0].text).toBe('FALLBACK');
  });
});

describe('resolveTemplateVariable (unit)', () => {
  const lead = {
    first_name: 'Iván',
    last_name: 'Soto',
    phone: '+34600123456',
    external_id: '+34600123456',
  };

  it('mapea name=nombre → first_name', () => {
    expect(resolveTemplateVariable({ name: 'nombre', sample: 'Pepe' }, lead)).toBe('Iván');
  });

  it('mapea name=first_name → first_name (case-insensitive)', () => {
    expect(resolveTemplateVariable({ name: 'First_Name', sample: 'X' }, lead)).toBe('Iván');
  });

  it('mapea name=1 (placeholder posicional Meta) → first_name', () => {
    expect(resolveTemplateVariable({ name: '1', sample: 'X' }, lead)).toBe('Iván');
  });

  it('mapea name=apellido → last_name', () => {
    expect(resolveTemplateVariable({ name: 'apellido', sample: 'X' }, lead)).toBe('Soto');
  });

  it('mapea name=full_name → first + last', () => {
    expect(resolveTemplateVariable({ name: 'full_name', sample: 'X' }, lead)).toBe('Iván Soto');
  });

  it('si name no matchea ningún campo, cae al sample', () => {
    expect(resolveTemplateVariable({ name: 'producto', sample: 'Curso A' }, lead)).toBe('Curso A');
  });

  // 2026-08-25 — antes este caso caía al `sample` de la plantilla. El sample es
  // el ejemplo que el entrenador puso para la revisión de Meta y suele ser su
  // PROPIO nombre: en la plantilla de Tania es "Tania", así que un lead sin
  // nombre recibía "Hola Tania, soy Tânia Matos…" — ella saludándose a sí misma.
  // Ahora un hueco de nombre sin dato usa un saludo neutro, nunca el sample.
  const leadSinDatos = { first_name: null, last_name: null, phone: null, external_id: null };

  it('lead sin first_name NO usa el sample de la plantilla (era el nombre del entrenador)', () => {
    const out = resolveTemplateVariable({ name: 'nombre', sample: 'Tania' }, leadSinDatos);
    expect(out).not.toBe('Tania');
    expect(out).toBe('buenas');
  });

  it('el fallback de nombre no va vacío (Meta no garantiza aceptar parámetros vacíos)', () => {
    for (const name of ['nombre', 'first_name', '1', 'apellido', 'full_name']) {
      const out = resolveTemplateVariable({ name, sample: 'Tania' }, leadSinDatos);
      expect(out.trim().length, name).toBeGreaterThan(0);
      expect(out, name).not.toBe('Tania');
    }
  });

  it('un nombre en blanco cuenta como ausente', () => {
    expect(
      resolveTemplateVariable({ name: 'nombre', sample: 'Tania' }, { ...leadSinDatos, first_name: '   ' }),
    ).toBe('buenas');
  });

  it('el teléfono ausente no cae a un número de ejemplo ajeno', () => {
    expect(resolveTemplateVariable({ name: 'telefono', sample: '+34600000000' }, leadSinDatos)).toBe('');
  });

  it('variable sin name → sample', () => {
    expect(resolveTemplateVariable({ sample: 'X' }, lead)).toBe('X');
  });

  it('variable sin name ni sample → cadena vacía', () => {
    expect(resolveTemplateVariable({}, lead)).toBe('');
  });
});

describe('interpolateTemplateBody (unit)', () => {
  const lead = {
    first_name: 'Iván',
    last_name: 'Soto',
    phone: '+34659487594',
    external_id: '+34659487594',
  };

  it('sustituye {{nombre}} por first_name del lead', () => {
    const out = interpolateTemplateBody(
      'Buenas {{nombre}}, bienvenido',
      [{ name: 'nombre', sample: 'Pepe' }],
      lead,
    );
    expect(out).toBe('Buenas Iván, bienvenido');
  });

  it('sustituye placeholder posicional {{1}} por la primera variable resuelta', () => {
    const out = interpolateTemplateBody(
      'Hola {{1}}!',
      [{ name: '1', sample: 'Default' }],
      lead,
    );
    expect(out).toBe('Hola Iván!');
  });

  it('múltiples variables {{nombre}} {{apellido}}', () => {
    const out = interpolateTemplateBody(
      'Hola {{nombre}} {{apellido}}',
      [
        { name: 'nombre', sample: 'X' },
        { name: 'apellido', sample: 'Y' },
      ],
      lead,
    );
    expect(out).toBe('Hola Iván Soto');
  });

  it('placeholder sin variable matcheada se queda literal (no rompe)', () => {
    const out = interpolateTemplateBody(
      'Hola {{producto}}',
      [{ name: 'nombre', sample: 'X' }],
      lead,
    );
    expect(out).toBe('Hola {{producto}}');
  });

  it('body sin placeholders se devuelve tal cual', () => {
    expect(interpolateTemplateBody('Hola amigo', [], lead)).toBe('Hola amigo');
  });
});
