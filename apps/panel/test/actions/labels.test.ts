import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests de actions de labels — auth + validation + system constraints.
// =============================================================================

const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}> = [];
const deleteCalls: Array<{ table: string; filters: Array<{ col: string; val: unknown }> }> = [];
const upsertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const revalidateCalls: string[] = [];

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

let mockLabelLookup: { tenant_id: number; is_system: boolean } | null = null;
let mockConvLookup: { tenant_id: number } | { assigned_user_id: string | null } | null = null;
let mockInsertReturn: { id: number } | null = { id: 999 };
let mockInsertError: { code?: string; message: string } | null = null;
let listLabelsRows: Record<string, unknown>[] = [];
let listConvLabelRows: Record<string, unknown>[] = [];
let listRuleRows: Record<string, unknown>[] = [];

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidateCalls.push(path);
  },
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder = {
        select: (_cols: string) => {
          const sub = {
            eq: (_col: string, _val: unknown) => {
              const sub2 = {
                eq: (_c2: string, _v2: unknown) => sub2,
                in: (_c3: string, _v3: unknown) => ({
                  eq: (_c4: string, _v4: unknown) => ({
                    eq: (_c5: string, _v5: unknown) => ({
                      then: (
                        resolve: (v: { data: Record<string, unknown>[] }) => unknown,
                      ) => Promise.resolve({ data: listRuleRows }).then(resolve),
                    }),
                    then: (
                      resolve: (v: { data: Record<string, unknown>[] }) => unknown,
                    ) => Promise.resolve({ data: listConvLabelRows }).then(resolve),
                  }),
                  then: (
                    resolve: (v: { data: Record<string, unknown>[] }) => unknown,
                  ) => Promise.resolve({ data: listConvLabelRows }).then(resolve),
                }),
                order: (_o: string, _opt: unknown) => ({
                  order: () => ({
                    then: (
                      resolve: (v: { data: Record<string, unknown>[] }) => unknown,
                    ) => Promise.resolve({ data: listLabelsRows }).then(resolve),
                  }),
                  then: (resolve: (v: { data: Record<string, unknown>[] }) => unknown) =>
                    Promise.resolve({ data: listLabelsRows }).then(resolve),
                }),
                maybeSingle: async () => {
                  if (table === 'tenant_labels') return { data: mockLabelLookup };
                  if (table === 'conversations') return { data: mockConvLookup };
                  return { data: null };
                },
                single: async () => ({ data: mockInsertReturn, error: mockInsertError }),
              };
              return sub2;
            },
          };
          return sub;
        },
        insert: (payload: Record<string, unknown>) => {
          insertCalls.push({ table, payload });
          return {
            select: (_cols: string) => ({
              single: async () => ({ data: mockInsertReturn, error: mockInsertError }),
            }),
          };
        },
        upsert: (payload: Record<string, unknown>, _opts?: unknown) => {
          upsertCalls.push({ table, payload });
          return {
            then: (resolve: (v: { error: null }) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
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
  upsertCalls.length = 0;
  revalidateCalls.length = 0;
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 5,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  mockLabelLookup = null;
  mockConvLookup = null;
  mockInsertReturn = { id: 999 };
  mockInsertError = null;
  listLabelsRows = [];
  listConvLabelRows = [];
  listRuleRows = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('createLabel — validation', () => {
  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({ name: 'x', color: '#ef4444' });
    expect(r.ok).toBe(false);
  });

  it('rechaza si viewer (no es owner)', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({ name: 'x', color: '#ef4444' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner/);
  });

  it('rechaza color inválido', async () => {
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({ name: 'x', color: 'red' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/color/);
  });

  it('rechaza destination_bucket inválido', async () => {
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({
      name: 'x',
      color: '#ef4444',
      // @ts-expect-error - testing runtime validation
      destinationBucket: 'invalid_bucket',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/destination_bucket/);
  });

  it('happy path → insert + revalidate', async () => {
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({
      name: 'Objeción precio',
      color: '#f97316',
      pauseAiOnApply: true,
    });
    expect(r.ok).toBe(true);
    const ins = insertCalls.find((c) => c.table === 'tenant_labels');
    expect(ins).toBeDefined();
    expect(ins?.payload.name).toBe('Objeción precio');
    expect(ins?.payload.tenant_id).toBe(5);
    expect(ins?.payload.is_system).toBe(false);
    expect(ins?.payload.pause_ai_on_apply).toBe(true);
    expect(revalidateCalls).toContain('/labels');
  });

  it('detecta duplicado (Postgres 23505) con error legible', async () => {
    mockInsertError = { code: '23505', message: 'duplicate key' };
    mockInsertReturn = null;
    const { createLabel } = await import('../../lib/actions/labels');
    const r = await createLabel({ name: 'Hot Lead', color: '#ef4444' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya existe/);
  });
});

describe('updateLabel — system constraints', () => {
  it('bloquea renombrar etiqueta system', async () => {
    mockLabelLookup = { tenant_id: 5, is_system: true };
    const { updateLabel } = await import('../../lib/actions/labels');
    const r = await updateLabel({ labelId: 1, patch: { name: 'Nuevo nombre' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/system/);
  });

  it('bloquea cambiar destination_bucket de etiqueta system', async () => {
    mockLabelLookup = { tenant_id: 5, is_system: true };
    const { updateLabel } = await import('../../lib/actions/labels');
    const r = await updateLabel({
      labelId: 1,
      patch: { destinationBucket: 'chats' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/destination_bucket/);
  });

  it('permite cambiar color y pause_ai_on_apply en etiqueta system', async () => {
    mockLabelLookup = { tenant_id: 5, is_system: true };
    const { updateLabel } = await import('../../lib/actions/labels');
    const r = await updateLabel({
      labelId: 1,
      patch: { color: '#000000', pauseAiOnApply: false },
    });
    expect(r.ok).toBe(true);
    const upd = updateCalls.find((c) => c.table === 'tenant_labels');
    expect(upd?.payload.color).toBe('#000000');
    expect(upd?.payload.pause_ai_on_apply).toBe(false);
  });
});

describe('deleteLabel — system protection', () => {
  it('bloquea borrar etiqueta system', async () => {
    mockLabelLookup = { tenant_id: 5, is_system: true };
    const { deleteLabel } = await import('../../lib/actions/labels');
    const r = await deleteLabel(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/system/);
  });

  it('permite borrar etiqueta custom', async () => {
    mockLabelLookup = { tenant_id: 5, is_system: false };
    const { deleteLabel } = await import('../../lib/actions/labels');
    const r = await deleteLabel(1);
    expect(r.ok).toBe(true);
    expect(deleteCalls.find((c) => c.table === 'tenant_labels')).toBeDefined();
  });
});

describe('applyLabel — auth + side effects', () => {
  beforeEach(() => {
    mockConvLookup = { tenant_id: 5 } as { tenant_id: number };
  });

  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    mockLabelLookup = { tenant_id: 5, is_system: false };
    const { applyLabel } = await import('../../lib/actions/labels');
    const r = await applyLabel({ conversationId: 100, labelId: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/viewer/);
  });

  it('rechaza si tenant del label no coincide con conversation', async () => {
    mockLabelLookup = { tenant_id: 999, is_system: false };
    mockConvLookup = { tenant_id: 5 };
    const { applyLabel } = await import('../../lib/actions/labels');
    const r = await applyLabel({ conversationId: 100, labelId: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sub-cuenta/);
  });
});
