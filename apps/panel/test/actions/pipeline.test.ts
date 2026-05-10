import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para pipeline.ts — auth + mutual exclusion + reuso de Sprint Eta.
// =============================================================================

const applyLabelCalls: Array<{ conversationId: number; labelId: number }> = [];
const removeLabelCalls: Array<{ conversationId: number; labelId: number }> = [];

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

let mockConvLookup: { tenant_id: number } | null = { tenant_id: 5 };
let mockTargetLabel: { id: number } | null = { id: 100 };
let mockExistingOutcomes: Array<{ label_id: number }> = [];

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

vi.mock('@/lib/actions/labels', async () => {
  const actual = await vi.importActual<typeof import('../../lib/actions/labels')>(
    '../../lib/actions/labels',
  );
  return {
    ...actual,
    applyLabel: async (input: { conversationId: number; labelId: number }) => {
      applyLabelCalls.push(input);
      return { ok: true };
    },
    removeLabel: async (input: { conversationId: number; labelId: number }) => {
      removeLabelCalls.push(input);
      return { ok: true };
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      // chain soporta .eq().eq().eq().maybeSingle() y .eq().eq().in()→thenable.
      function makeChain() {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => ({
            then: (resolve: (v: { data: unknown[] }) => unknown) =>
              Promise.resolve({ data: mockExistingOutcomes }).then(resolve),
          }),
          maybeSingle: async () => {
            if (table === 'conversations') return { data: mockConvLookup, error: null };
            if (table === 'tenant_labels') return { data: mockTargetLabel, error: null };
            return { data: null, error: null };
          },
        };
        return chain;
      }
      return {
        select: () => makeChain(),
      };
    },
  }),
}));

beforeEach(() => {
  applyLabelCalls.length = 0;
  removeLabelCalls.length = 0;
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 5,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  mockConvLookup = { tenant_id: 5 };
  mockTargetLabel = { id: 100 };
  mockExistingOutcomes = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('applyPipelineOutcome — auth', () => {
  it('rechaza viewer', async () => {
    mockEffectiveTenant = {
      userId: 'u',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'cancelled' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/viewer/);
  });

  it('rechaza sin sesión', async () => {
    mockEffectiveTenant = null;
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'lost' });
    expect(r.ok).toBe(false);
  });

  it('rechaza conv de otro tenant', async () => {
    mockConvLookup = { tenant_id: 999 };
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'cancelled' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tenant/);
  });

  it('admin puede mover (no solo owner)', async () => {
    mockEffectiveTenant = {
      userId: 'admin-uid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'admin',
    };
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'cancelled' });
    expect(r.ok).toBe(true);
  });
});

describe('applyPipelineOutcome — validation', () => {
  it('rechaza bucket inválido', async () => {
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    // @ts-expect-error - testing runtime validation
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'invalid_xyz' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bucket/);
  });

  it('rechaza si system label no existe para el tenant', async () => {
    mockTargetLabel = null;
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'cancelled' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/system_label_missing/);
  });

  it('rechaza conversationId inválido', async () => {
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 0, bucket: 'cancelled' });
    expect(r.ok).toBe(false);
  });
});

describe('applyPipelineOutcome — mutual exclusion', () => {
  it('aplica la label target sin previas → 1 applyLabel, 0 removeLabel', async () => {
    mockExistingOutcomes = [];
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'bought' });
    expect(r.ok).toBe(true);
    expect(applyLabelCalls).toHaveLength(1);
    expect(applyLabelCalls[0]!.labelId).toBe(100);
    expect(removeLabelCalls).toHaveLength(0);
  });

  it('si hay outcomes previos, los remueve antes de aplicar el nuevo', async () => {
    mockExistingOutcomes = [{ label_id: 50 }, { label_id: 51 }];
    const { applyPipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await applyPipelineOutcome({ conversationId: 10, bucket: 'bought' });
    expect(r.ok).toBe(true);
    expect(removeLabelCalls).toHaveLength(2);
    expect(removeLabelCalls.map((c) => c.labelId).sort()).toEqual([50, 51]);
    expect(applyLabelCalls).toHaveLength(1);
    expect(applyLabelCalls[0]!.labelId).toBe(100);
  });
});

describe('removePipelineOutcome', () => {
  it('owner quita todas las outcome labels activas', async () => {
    mockExistingOutcomes = [{ label_id: 50 }, { label_id: 51 }, { label_id: 52 }];
    const { removePipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await removePipelineOutcome({ conversationId: 10 });
    expect(r.ok).toBe(true);
    expect(removeLabelCalls).toHaveLength(3);
  });

  it('viewer no puede quitar', async () => {
    mockEffectiveTenant = {
      userId: 'v',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { removePipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await removePipelineOutcome({ conversationId: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/viewer/);
  });

  it('sin outcomes activas → ok sin remover', async () => {
    mockExistingOutcomes = [];
    const { removePipelineOutcome } = await import('../../lib/actions/pipeline');
    const r = await removePipelineOutcome({ conversationId: 10 });
    expect(r.ok).toBe(true);
    expect(removeLabelCalls).toHaveLength(0);
  });
});
