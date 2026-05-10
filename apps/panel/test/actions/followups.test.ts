import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para followups actions — auth + validation + scheduling.
// =============================================================================

const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}> = [];
const deleteCalls: Array<{ table: string; filters: Array<{ col: string; val: unknown }> }> = [];

let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  role: 'owner' | 'admin' | 'viewer';
} | null = {
  userId: 'actor-uuid',
  tenantId: 5,
  isAgencyAdmin: false,
  isImpersonating: false,
  role: 'owner',
};

let maybeSingleQueue: Array<{ data: unknown; error: null }> = [];
let mockInsertReturn: { id: number } | null = { id: 999 };
let mockInsertError: { code?: string; message: string } | null = null;

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            const next = maybeSingleQueue.shift();
            if (next) return next;
            return { data: null };
          },
          then: (resolve: (v: { data: unknown[] }) => unknown) =>
            Promise.resolve({ data: [] }).then(resolve),
        };
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({ data: mockInsertReturn, error: mockInsertError }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        const call = {
          table,
          payload,
          filters: [] as Array<{ col: string; val: unknown }>,
        };
        updateCalls.push(call);
        const chain = {
          eq: (col: string, val: unknown) => {
            call.filters.push({ col, val });
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
      delete: () => {
        const call = {
          table,
          filters: [] as Array<{ col: string; val: unknown }>,
        };
        deleteCalls.push(call);
        const chain = {
          eq: (col: string, val: unknown) => {
            call.filters.push({ col, val });
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
}));

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 5,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  maybeSingleQueue = [];
  mockInsertReturn = { id: 999 };
  mockInsertError = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

// ===========================================================================
// Templates CRUD
// ===========================================================================

describe('createFollowupTemplate — auth + validation', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({ name: 'X', body: 'Hola' });
    expect(r.ok).toBe(false);
  });

  it('rechaza nombre vacío', async () => {
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({ name: '   ', body: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/);
  });

  it('rechaza body vacío', async () => {
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({ name: 'OK', body: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cuerpo/);
  });

  it('rechaza body >4000 chars', async () => {
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({ name: 'OK', body: 'x'.repeat(4001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/largo/);
  });

  it('happy path inserta template', async () => {
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({
      name: 'Reminder 24h',
      body: 'Hola, recuerda tu cita',
      description: 'Para reminder pre-cita',
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'followup_templates');
    expect(ins?.payload.name).toBe('Reminder 24h');
    expect(ins?.payload.tenant_id).toBe(5);
    expect(ins?.payload.created_by).toBe('actor-uuid');
  });

  it('detecta duplicado 23505', async () => {
    mockInsertError = { code: '23505', message: 'dup' };
    mockInsertReturn = null;
    const { createFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await createFollowupTemplate({ name: 'X', body: 'y' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya existe/);
  });
});

describe('deleteFollowupTemplate', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { deleteFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await deleteFollowupTemplate(1);
    expect(r.ok).toBe(false);
  });

  it('rechaza template de otro tenant', async () => {
    maybeSingleQueue = [{ data: { tenant_id: 999 }, error: null }];
    const { deleteFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await deleteFollowupTemplate(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('owner borra OK', async () => {
    maybeSingleQueue = [{ data: { tenant_id: 5 }, error: null }];
    const { deleteFollowupTemplate } = await import('../../lib/actions/followups');
    const r = await deleteFollowupTemplate(1);
    expect(r.ok).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'followup_templates')).toBeDefined();
  });
});

// ===========================================================================
// scheduleFollowup
// ===========================================================================

describe('scheduleFollowup — auth + validation', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: new Date(Date.now() + 60000).toISOString(),
    });
    expect(r.ok).toBe(false);
  });

  it('rechaza body vacío', async () => {
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: '   ',
      scheduledAtIso: new Date(Date.now() + 60000).toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/vac[ií]o/);
  });

  it('rechaza fecha en pasado o muy cerca', async () => {
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: new Date(Date.now() - 1000).toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/futuro/);
  });

  it('rechaza fecha >1 año', async () => {
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: new Date(Date.now() + 400 * 86400000).toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1 a[ñn]o/);
  });

  it('rechaza fecha inválida (NaN)', async () => {
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: 'invalid-date',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/inv[áa]lida/);
  });

  it('rechaza conv de otro tenant', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 999 }, error: null }, // conv lookup
    ];
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: new Date(Date.now() + 60000).toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('happy path inserta con auto_cancel_on_reply default true', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 5 }, error: null }, // conv lookup
      { data: { channel_id: 10 }, error: null }, // conv channel
      { data: { id: 50 }, error: null }, // integration_account
    ];
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Reminder!',
      scheduledAtIso: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'message_schedules');
    expect(ins).toBeDefined();
    expect(ins?.payload.message_type).toBe('follow_up');
    expect(ins?.payload.message).toBe('Reminder!');
    expect(ins?.payload.auto_cancel_on_reply).toBe(true);
    expect(ins?.payload.created_by_user_id).toBe('actor-uuid');
    expect(ins?.payload.integration_account_id).toBe(50);
  });

  it('rechaza si canal no tiene integration_account activa', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 5 }, error: null }, // conv lookup
      { data: { channel_id: 10 }, error: null }, // conv channel
      { data: null, error: null }, // no integration_account
    ];
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Hola',
      scheduledAtIso: new Date(Date.now() + 60000).toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/integration_account/);
  });

  it('autoCancelOnReply=false respetado', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 5 }, error: null },
      { data: { channel_id: 10 }, error: null },
      { data: { id: 50 }, error: null },
    ];
    const { scheduleFollowup } = await import('../../lib/actions/followups');
    const r = await scheduleFollowup({
      conversationId: 1,
      body: 'Firme reminder',
      scheduledAtIso: new Date(Date.now() + 60000).toISOString(),
      autoCancelOnReply: false,
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'message_schedules');
    expect(ins?.payload.auto_cancel_on_reply).toBe(false);
  });
});

describe('cancelScheduledFollowup', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { cancelScheduledFollowup } = await import('../../lib/actions/followups');
    const r = await cancelScheduledFollowup(1);
    expect(r.ok).toBe(false);
  });

  it('rechaza followup de otro tenant', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 999, status: 'pending', conversation_id: 1 }, error: null },
    ];
    const { cancelScheduledFollowup } = await import('../../lib/actions/followups');
    const r = await cancelScheduledFollowup(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('rechaza si status != pending', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 5, status: 'sent', conversation_id: 1 }, error: null },
    ];
    const { cancelScheduledFollowup } = await import('../../lib/actions/followups');
    const r = await cancelScheduledFollowup(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sent/);
  });

  it('owner cancela OK + UPDATE status=cancelled', async () => {
    maybeSingleQueue = [
      { data: { tenant_id: 5, status: 'pending', conversation_id: 1 }, error: null },
    ];
    const { cancelScheduledFollowup } = await import('../../lib/actions/followups');
    const r = await cancelScheduledFollowup(1);
    expect(r.ok).toBe(true);
    const upd = updateCalls.find((c) => c.table === 'message_schedules');
    expect(upd?.payload.status).toBe('cancelled');
  });
});

describe('listScheduledFollowups', () => {
  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { listScheduledFollowups } = await import('../../lib/actions/followups');
    const r = await listScheduledFollowups(1);
    expect(r.ok).toBe(false);
  });

  it('viewer puede leer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    maybeSingleQueue = [{ data: { tenant_id: 5 }, error: null }];
    const { listScheduledFollowups } = await import('../../lib/actions/followups');
    const r = await listScheduledFollowups(1);
    expect(r.ok).toBe(true);
  });
});
