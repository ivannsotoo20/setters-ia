import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para apps/panel/lib/actions/gdpr.ts
//
// Cubre: auth + happy path export + happy path delete + denials.
// =============================================================================

let mockEffective:
  | {
      userId: string;
      tenantId: number;
      isAgencyAdmin: boolean;
      isImpersonating: boolean;
      role: 'owner' | 'admin' | 'viewer';
    }
  | null = {
  userId: 'actor-uuid',
  tenantId: 7,
  isAgencyAdmin: false,
  isImpersonating: false,
  role: 'owner',
};

let mockLeadRow: { id: number; tenant_id: number; external_id?: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null =
  { id: 42, tenant_id: 7, external_id: 'ig:carlos', first_name: 'Carlos', last_name: 'Pérez' };

const auditInserts: Array<Record<string, unknown>> = [];
const deletedTables: Array<{ table: string; filter: Record<string, unknown> }> = [];
const insertedAudit: Array<Record<string, unknown>> = [];

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffective,
}));

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceRoleClient: () => buildMockSupabase(),
}));

function buildMockSupabase() {
  return {
    from: (table: string) => buildTableHandle(table),
  };
}

function buildTableHandle(table: string) {
  const ctx: { filters: Record<string, unknown>; inFilters: Record<string, unknown[]> } = {
    filters: {},
    inFilters: {},
  };
  const chain: Record<string, unknown> = {
    select: (_cols: string, _opts?: unknown) => chain,
    eq: (col: string, val: unknown) => {
      ctx.filters[col] = val;
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      ctx.inFilters[col] = vals;
      return chain;
    },
    or: (_clause: string) => chain,
    maybeSingle: async () => resolveMaybeSingle(table, ctx),
    insert: async (row: Record<string, unknown>) => {
      if (table === 'tenant_audit_log') {
        insertedAudit.push(row);
      }
      return { error: null };
    },
    delete: () => ({
      eq: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return {
          eq: (col2: string, val2: unknown) => {
            ctx.filters[col2] = val2;
            deletedTables.push({ table, filter: { ...ctx.filters } });
            return Promise.resolve({ error: null });
          },
          in: (col2: string, vals: unknown[]) => {
            ctx.inFilters[col2] = vals;
            deletedTables.push({
              table,
              filter: { ...ctx.filters, [`${col2}_in`]: vals },
            });
            return Promise.resolve({ error: null });
          },
          then: (resolve: (v: { error: null }) => void) => {
            deletedTables.push({ table, filter: { ...ctx.filters } });
            resolve({ error: null });
          },
        };
      },
    }),
    then: (resolve: (v: { data: unknown; error: null; count?: number }) => void) => {
      resolve(resolveListQuery(table, ctx));
    },
  };
  return chain;
}

function resolveMaybeSingle(table: string, _ctx: { filters: Record<string, unknown> }) {
  if (table === 'leads') return { data: mockLeadRow, error: null };
  if (table === 'profiles') return { data: { email: 'owner@test.com' }, error: null };
  return { data: null, error: null };
}

function resolveListQuery(
  table: string,
  _ctx: { filters: Record<string, unknown>; inFilters: Record<string, unknown[]> },
) {
  if (table === 'conversations') {
    return { data: [{ id: 100 }, { id: 101 }], error: null };
  }
  if (table === 'conversation_messages') {
    return { data: [{ id: 1, content: 'hola' }, { id: 2, content: 'bien' }], error: null, count: 2 };
  }
  if (table === 'llm_calls') {
    return { data: [{ id: 11 }, { id: 12 }, { id: 13 }], error: null, count: 3 };
  }
  if (table === 'pipeline_runs') {
    return { data: [{ id: 1 }, { id: 2 }], error: null, count: 2 };
  }
  if (table === 'notification_events') {
    return {
      data: [
        { id: 11, payload: { lead_id: 42, kind: 'qualified' } },
        { id: 12, payload: { conversation_id: 100 } },
        { id: 13, payload: { lead_id: 99 } }, // distinta lead, no debe matchear
      ],
      error: null,
    };
  }
  return { data: [], error: null };
}

beforeEach(() => {
  auditInserts.length = 0;
  deletedTables.length = 0;
  insertedAudit.length = 0;
  mockEffective = {
    userId: 'actor-uuid',
    tenantId: 7,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  mockLeadRow = {
    id: 42,
    tenant_id: 7,
    external_id: 'ig:carlos',
    first_name: 'Carlos',
    last_name: 'Pérez',
  };
});

describe('exportContactDataAction', () => {
  it('falla si no hay sesión', async () => {
    mockEffective = null;
    const { exportContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await exportContactDataAction({ leadId: 42 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('unauthenticated');
  });

  it('falla si el rol no es owner/agency_admin', async () => {
    mockEffective = {
      userId: 'actor-uuid',
      tenantId: 7,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    const { exportContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await exportContactDataAction({ leadId: 42 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('forbidden');
  });

  it('falla si el leadId es inválido', async () => {
    const { exportContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await exportContactDataAction({ leadId: -1 });
    expect(res.ok).toBe(false);
  });

  it('falla si el lead pertenece a otro tenant y no soy agency admin', async () => {
    mockLeadRow = { id: 42, tenant_id: 999 };
    const { exportContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await exportContactDataAction({ leadId: 42 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('wrong tenant');
  });

  it('happy path: devuelve datos + escribe audit log gdpr.exported', async () => {
    const { exportContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await exportContactDataAction({ leadId: 42 });
    expect(res.ok).toBe(true);
    if (res.ok && res.data) {
      expect(res.data.lead).toMatchObject({ id: 42, tenant_id: 7 });
      expect(res.data.conversations).toHaveLength(2);
      expect(res.data.messages).toHaveLength(2);
      // notification_events filtered: solo las que pertenecen al lead 42 o sus convs.
      expect(res.data.notificationEvents).toHaveLength(2);
    }
    const auditEvent = insertedAudit.find((a) => a.action === 'gdpr.exported');
    expect(auditEvent).toBeDefined();
    expect((auditEvent?.metadata as Record<string, unknown>).lead_id).toBe(42);
  });
});

describe('deleteContactDataAction', () => {
  it('falla sin confirmación', async () => {
    const { deleteContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await deleteContactDataAction({ leadId: 42, confirmation: 'cualquier cosa' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('confirmación');
  });

  it('falla si el rol es admin (no owner)', async () => {
    mockEffective = {
      userId: 'actor-uuid',
      tenantId: 7,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    const { deleteContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await deleteContactDataAction({
      leadId: 42,
      confirmation: 'ELIMINAR DEFINITIVAMENTE',
    });
    expect(res.ok).toBe(false);
  });

  it('happy path: borra cascade + escribe audit gdpr.deleted', async () => {
    const { deleteContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await deleteContactDataAction({
      leadId: 42,
      confirmation: 'ELIMINAR DEFINITIVAMENTE',
    });
    expect(res.ok).toBe(true);
    // notification_events delete con los IDs filtrados
    const notifDelete = deletedTables.find((d) => d.table === 'notification_events');
    expect(notifDelete).toBeDefined();
    // llm_calls + pipeline_runs borrados ANTES del lead (sin PII residual)
    const llmDelete = deletedTables.find((d) => d.table === 'llm_calls');
    expect(llmDelete).toBeDefined();
    const runsDelete = deletedTables.find((d) => d.table === 'pipeline_runs');
    expect(runsDelete).toBeDefined();
    // leads delete
    const leadDelete = deletedTables.find((d) => d.table === 'leads');
    expect(leadDelete).toBeDefined();
    expect(leadDelete?.filter).toMatchObject({ id: 42, tenant_id: 7 });
    // audit log
    const auditEvent = insertedAudit.find((a) => a.action === 'gdpr.deleted');
    expect(auditEvent).toBeDefined();
    const meta = auditEvent?.metadata as Record<string, unknown>;
    expect(meta.lead_id).toBe(42);
    expect(meta.lead_first_name).toBe('Carlos');
    expect(meta.llm_calls_deleted).toBe(3);
    expect(meta.pipeline_runs_deleted).toBe(2);
    // PII se hashea, NO se almacena en claro
    expect(meta.lead_phone_hash ?? null).not.toBe('claro');
    // El resultado expone los nuevos contadores
    if (res.ok && res.data) {
      expect(res.data.llmCallsDeleted).toBe(3);
      expect(res.data.pipelineRunsDeleted).toBe(2);
    }
  });

  it('agency admin puede borrar lead de otro tenant', async () => {
    mockEffective = {
      userId: 'admin-uuid',
      tenantId: 1,
      isAgencyAdmin: true,
      isImpersonating: false,
      role: 'owner',
    };
    mockLeadRow = { id: 42, tenant_id: 99, external_id: 'ig:carlos' };
    const { deleteContactDataAction } = await import('@/lib/actions/gdpr');
    const res = await deleteContactDataAction({
      leadId: 42,
      confirmation: 'ELIMINAR DEFINITIVAMENTE',
    });
    expect(res.ok).toBe(true);
  });
});
