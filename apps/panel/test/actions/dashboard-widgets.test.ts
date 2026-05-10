import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para dashboard-widgets actions — auth + CRUD + reorder.
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

// Cola FIFO de respuestas para .maybeSingle() — el código hace múltiples
// llamadas por action, cada una resuelta en orden.
let maybeSingleQueue: Array<{ data: unknown; error: null }> = [];
let mockExistingList: Array<{ id: number; tenant_id: number }> = [];
let mockInsertReturn: { id: number } | null = { id: 999 };

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder = {
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
              Promise.resolve({ data: mockExistingList }).then(resolve),
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          insertCalls.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: mockInsertReturn, error: null }),
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
      };
      return builder;
    },
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
  mockExistingList = [];
  mockInsertReturn = { id: 999 };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('createWidget — auth', () => {
  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'leads_total' });
    expect(r.ok).toBe(false);
  });

  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'leads_total' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/);
  });

  it('admin puede crear', async () => {
    mockEffectiveTenant = {
      userId: 'admin-uid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    maybeSingleQueue = [{ data: { position: 6 }, error: null }];
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'won' });
    expect(r.ok).toBe(true);
  });
});

describe('createWidget — validation', () => {
  it('rechaza metric_key inválida', async () => {
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'invalid_xyz' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cat[aá]logo/);
  });

  it('happy path inserta con position correcto + tenant', async () => {
    maybeSingleQueue = [{ data: { position: 6 }, error: null }];
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'won', filter: { channel: 'wa' } });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'dashboard_widgets');
    expect(ins).toBeDefined();
    expect(ins?.payload.tenant_id).toBe(5);
    expect(ins?.payload.metric_key).toBe('won');
    expect(ins?.payload.position).toBe(7);
    expect(ins?.payload.filter_json).toEqual({ channel: 'wa' });
  });

  it('filter inválido se sanea (canal no válido se omite)', async () => {
    maybeSingleQueue = [{ data: { position: 0 }, error: null }];
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({
      metricKey: 'won',
      // @ts-expect-error - testing runtime sanitization
      filter: { channel: 'invalid_channel' },
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'dashboard_widgets');
    expect(ins?.payload.filter_json).toEqual({});
  });

  it('primer widget del tenant (no max anterior) → position 0', async () => {
    maybeSingleQueue = [{ data: null, error: null }];
    const { createWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await createWidget({ metricKey: 'leads_total' });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'dashboard_widgets');
    expect(ins?.payload.position).toBe(0);
  });
});

describe('deleteWidget', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { deleteWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await deleteWidget(10);
    expect(r.ok).toBe(false);
  });

  it('rechaza widget de otro tenant', async () => {
    maybeSingleQueue = [{ data: { tenant_id: 999 }, error: null }];
    const { deleteWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await deleteWidget(10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('owner borra OK', async () => {
    maybeSingleQueue = [{ data: { tenant_id: 5 }, error: null }];
    const { deleteWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await deleteWidget(10);
    expect(r.ok).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'dashboard_widgets')).toBeDefined();
  });

  it('rechaza widget no encontrado', async () => {
    maybeSingleQueue = [{ data: null, error: null }];
    const { deleteWidget } = await import('../../lib/actions/dashboard-widgets');
    const r = await deleteWidget(10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no encontrado/);
  });
});

describe('reorderWidgets', () => {
  it('rechaza array vacío', async () => {
    const { reorderWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await reorderWidgets([]);
    expect(r.ok).toBe(false);
  });

  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { reorderWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await reorderWidgets([1, 2, 3]);
    expect(r.ok).toBe(false);
  });

  it('rechaza si algún id no existe', async () => {
    mockExistingList = [{ id: 1, tenant_id: 5 }]; // pidieron 3, solo 1 existe
    const { reorderWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await reorderWidgets([1, 2, 3]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no existen/);
  });

  it('rechaza si algún widget pertenece a otro tenant', async () => {
    mockExistingList = [
      { id: 1, tenant_id: 5 },
      { id: 2, tenant_id: 999 },
      { id: 3, tenant_id: 5 },
    ];
    const { reorderWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await reorderWidgets([1, 2, 3]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('happy path: 3 UPDATE con positions 0/1/2', async () => {
    mockExistingList = [
      { id: 10, tenant_id: 5 },
      { id: 20, tenant_id: 5 },
      { id: 30, tenant_id: 5 },
    ];
    const { reorderWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await reorderWidgets([30, 10, 20]);
    expect(r.ok).toBe(true);
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0]!.payload.position).toBe(0);
    expect(updateCalls[1]!.payload.position).toBe(1);
    expect(updateCalls[2]!.payload.position).toBe(2);
  });
});

describe('listWidgets', () => {
  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { listWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await listWidgets();
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
    const { listWidgets } = await import('../../lib/actions/dashboard-widgets');
    const r = await listWidgets();
    expect(r.ok).toBe(true);
  });
});
