import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests del Server Action `setWaInboundMode` (Hito 10 sub-fase 3).
 *
 * 3 tests:
 *   1. Rechaza viewer (solo owner/agency admin pueden cambiar el modo).
 *   2. Rechaza switch a 'keyword' si tenant no tiene keywords wa_open activas.
 *   3. Acepta 'all' siempre (insert si no existe row tenant_configs).
 */

const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const revalidateCalls: string[] = [];

let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  role: 'owner' | 'admin' | 'viewer';
} | null = {
  userId: 'actor-uuid',
  tenantId: 7,
  isAgencyAdmin: false,
  isImpersonating: false,
  role: 'owner',
};

let mockKeywordCount = 0;
let mockTenantConfigExists = false;

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
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        const builder = {
          eq: (_col: string, _val: unknown) => builder,
          maybeSingle: async () => {
            if (table === 'tenant_configs' && mockTenantConfigExists) {
              return { data: { tenant_id: 7 }, error: null };
            }
            return { data: null, error: null };
          },
          // Cuando count: 'exact' + head: true, supabase devuelve {count, error}.
          then: (resolve: (v: { count: number; error: null }) => unknown) => {
            if (opts?.count === 'exact' && opts.head === true) {
              return Promise.resolve({ count: mockKeywordCount, error: null }).then(
                resolve,
              );
            }
            return Promise.resolve({ count: 0, error: null }).then(resolve);
          },
        };
        return builder;
      },
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
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
    }),
  }),
}));

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  revalidateCalls.length = 0;
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 7,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  mockKeywordCount = 0;
  mockTenantConfigExists = false;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('setWaInboundMode', () => {
  it('rechaza viewer (solo owner/agency admin)', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 7,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { setWaInboundMode } = await import('../../lib/actions/wa-inbound-mode');
    const r = await setWaInboundMode('all');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/owner/);
    expect(updateCalls.length).toBe(0);
    expect(insertCalls.length).toBe(0);
  });

  it('rechaza switch a keyword si no hay keywords wa_open activas', async () => {
    mockKeywordCount = 0;
    mockTenantConfigExists = true;
    const { setWaInboundMode } = await import('../../lib/actions/wa-inbound-mode');
    const r = await setWaInboundMode('keyword');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/wa_open/);
    expect(updateCalls.length).toBe(0);
    expect(insertCalls.length).toBe(0);
  });

  it('acepta switch a all e inserta tenant_configs si no existe', async () => {
    mockTenantConfigExists = false;
    const { setWaInboundMode } = await import('../../lib/actions/wa-inbound-mode');
    const r = await setWaInboundMode('all');
    expect(r.ok).toBe(true);
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0]?.table).toBe('tenant_configs');
    expect(insertCalls[0]?.payload).toMatchObject({ tenant_id: 7, wa_inbound_mode: 'all' });
    expect(updateCalls.length).toBe(0);
    expect(revalidateCalls).toContain('/settings/whatsapp');
  });
});
