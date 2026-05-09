import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para label-rules.ts — auth + validation por trigger_type.
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

let mockLabelLookup: { tenant_id: number } | null = null;
let mockRuleLookup:
  | { tenant_id: number; trigger_type: string; trigger_value: Record<string, unknown> }
  | null = null;
let mockInsertReturn: { id: number } | null = { id: 999 };

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder = {
        select: (_cols: string) => ({
          eq: (_col: string, _val: unknown) => ({
            maybeSingle: async () => {
              if (table === 'tenant_labels') return { data: mockLabelLookup };
              if (table === 'label_automation_rules') return { data: mockRuleLookup };
              return { data: null };
            },
            order: () => ({
              then: (resolve: (v: { data: Record<string, unknown>[] }) => unknown) =>
                Promise.resolve({ data: [] }).then(resolve),
            }),
          }),
        }),
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
              return chain;
            },
            then: (resolve: (v: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
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
              return chain;
            },
            then: (resolve: (v: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
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
  mockLabelLookup = { tenant_id: 5 };
  mockRuleLookup = null;
  mockInsertReturn = { id: 999 };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('createLabelRule — validation', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r = await createLabelRule({
      labelId: 1,
      triggerType: 'text_contains',
      triggerWho: 'lead',
      triggerValue: { text: 'precio' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner/);
  });

  it('rechaza trigger_type inválido', async () => {
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r = await createLabelRule({
      labelId: 1,
      // @ts-expect-error - testing runtime validation
      triggerType: 'unsupported_xyz',
      triggerWho: 'lead',
      triggerValue: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trigger_type/);
  });

  it('text_contains sin trigger_value.text rechazado', async () => {
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r = await createLabelRule({
      labelId: 1,
      triggerType: 'text_contains',
      triggerWho: 'lead',
      triggerValue: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/text/);
  });

  it('inactivity_hours fuera de rango [1, 8760] rechazado', async () => {
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r1 = await createLabelRule({
      labelId: 1,
      triggerType: 'inactivity_hours',
      triggerWho: 'any',
      triggerValue: { hours: 0 },
    });
    expect(r1.ok).toBe(false);

    const r2 = await createLabelRule({
      labelId: 1,
      triggerType: 'inactivity_hours',
      triggerWho: 'any',
      triggerValue: { hours: 99999 },
    });
    expect(r2.ok).toBe(false);
  });

  it('text_contains válido → INSERT con tenant_id heredado del label', async () => {
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r = await createLabelRule({
      labelId: 1,
      triggerType: 'text_contains',
      triggerWho: 'lead',
      triggerValue: { text: 'precio' },
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'label_automation_rules');
    expect(ins).toBeDefined();
    expect(ins?.payload.tenant_id).toBe(5);
    expect(ins?.payload.label_id).toBe(1);
    expect(ins?.payload.trigger_type).toBe('text_contains');
    expect(ins?.payload.is_active).toBe(true);
  });

  it('rechaza si label no pertenece al tenant del actor', async () => {
    mockLabelLookup = { tenant_id: 999 };
    const { createLabelRule } = await import('../../lib/actions/label-rules');
    const r = await createLabelRule({
      labelId: 1,
      triggerType: 'text_contains',
      triggerWho: 'lead',
      triggerValue: { text: 'precio' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });
});

describe('toggleRule (admin+)', () => {
  beforeEach(() => {
    mockRuleLookup = {
      tenant_id: 5,
      trigger_type: 'text_contains',
      trigger_value: { text: 'precio' },
    };
  });

  it('owner puede pausar regla', async () => {
    const { toggleRule } = await import('../../lib/actions/label-rules');
    const r = await toggleRule(10, false);
    expect(r.ok).toBe(true);
    const upd = updateCalls.find((c) => c.table === 'label_automation_rules');
    expect(upd?.payload.is_active).toBe(false);
  });

  it('admin (collaborator) puede pausar regla — distinto a owner-only', async () => {
    mockEffectiveTenant = {
      userId: 'admin-uid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    const { toggleRule } = await import('../../lib/actions/label-rules');
    const r = await toggleRule(10, true);
    expect(r.ok).toBe(true);
  });

  it('viewer NO puede pausar regla', async () => {
    mockEffectiveTenant = {
      userId: 'viewer-uid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { toggleRule } = await import('../../lib/actions/label-rules');
    const r = await toggleRule(10, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/viewer/);
  });
});

describe('deleteRule', () => {
  beforeEach(() => {
    mockRuleLookup = {
      tenant_id: 5,
      trigger_type: 'text_contains',
      trigger_value: { text: 'x' },
    };
  });

  it('owner borra OK', async () => {
    const { deleteRule } = await import('../../lib/actions/label-rules');
    const r = await deleteRule(10);
    expect(r.ok).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'label_automation_rules')).toBeDefined();
  });

  it('admin NO puede borrar (solo owner)', async () => {
    mockEffectiveTenant = {
      userId: 'admin-uid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    const { deleteRule } = await import('../../lib/actions/label-rules');
    const r = await deleteRule(10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner/);
  });

  it('rechaza si la regla pertenece a otro tenant', async () => {
    mockRuleLookup = {
      tenant_id: 999,
      trigger_type: 'text_contains',
      trigger_value: { text: 'x' },
    };
    const { deleteRule } = await import('../../lib/actions/label-rules');
    const r = await deleteRule(10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });
});
