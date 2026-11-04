import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests del Server Action `setAiEnabled` (interruptor global del setter, migration 074).
 *
 * Hasta 2026-11-04 la action no comprobaba rol: cualquier miembro autenticado del
 * tenant (viewer incluido) podía apagar el setter. La escritura va con service_role,
 * así que RLS no lo ve; el control tiene que vivir aquí. Criterio: owner o admin del
 * tenant, o agency admin. El viewer mira, no toca.
 */

const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const revalidateCalls: string[] = [];

type Role = 'owner' | 'admin' | 'viewer';

let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  role: Role;
} | null = null;

function asRole(role: Role, isAgencyAdmin = false) {
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 7,
    isAgencyAdmin,
    isImpersonating: false,
    role,
  };
}

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidateCalls.push(path);
  },
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceRoleClient: () => ({
    from: (table: string) => ({
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
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return {
          then: (resolve: (v: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        };
      },
    }),
  }),
}));

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  revalidateCalls.length = 0;
  asRole('owner');
});

describe('setAiEnabled — control de rol', () => {
  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { setAiEnabled } = await import('../../lib/actions/ai-switch');
    const r = await setAiEnabled(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauthenticated');
    expect(updateCalls.length).toBe(0);
  });

  it('rechaza viewer sin tocar la BD', async () => {
    asRole('viewer');
    const { setAiEnabled } = await import('../../lib/actions/ai-switch');
    const r = await setAiEnabled(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
    expect(updateCalls.length).toBe(0);
    expect(insertCalls.length).toBe(0);
    expect(revalidateCalls.length).toBe(0);
  });

  it('acepta owner y escribe solo la fila de su tenant', async () => {
    asRole('owner');
    const { setAiEnabled } = await import('../../lib/actions/ai-switch');
    const r = await setAiEnabled(false);
    expect(r).toEqual({ ok: true, enabled: false });
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]?.table).toBe('tenant_configs');
    expect(updateCalls[0]?.payload).toMatchObject({ ai_enabled: false });
    expect(updateCalls[0]?.filters).toEqual([{ col: 'tenant_id', val: 7 }]);
    expect(revalidateCalls).toContain('/settings/preferences');
  });

  it('acepta admin del tenant (puede frenar un sábado) y deja rastro en audit log', async () => {
    asRole('admin');
    const { setAiEnabled } = await import('../../lib/actions/ai-switch');
    const r = await setAiEnabled(false);
    expect(r.ok).toBe(true);
    expect(updateCalls.length).toBe(1);
    const audit = insertCalls.find((c) => c.table === 'tenant_audit_log');
    expect(audit?.payload).toMatchObject({
      tenant_id: 7,
      actor_user_id: 'actor-uuid',
      action: 'ai.disabled',
    });
  });

  it('acepta agency admin aunque su rol natural no sea owner/admin', async () => {
    asRole('viewer', true);
    const { setAiEnabled } = await import('../../lib/actions/ai-switch');
    const r = await setAiEnabled(true);
    expect(r).toEqual({ ok: true, enabled: true });
    expect(updateCalls[0]?.payload).toMatchObject({ ai_enabled: true });
    const audit = insertCalls.find((c) => c.table === 'tenant_audit_log');
    expect(audit?.payload).toMatchObject({ action: 'ai.enabled' });
  });
});
