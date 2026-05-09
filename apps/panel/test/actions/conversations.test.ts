import { describe, it, expect, beforeEach, vi } from 'vitest';

interface UpdateCall {
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

const updateCalls: UpdateCall[] = [];
const revalidateCalls: string[] = [];
let updateError: { message: string } | null = null;
let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
  role: 'owner' | 'admin' | 'viewer';
} | null = {
  userId: 'user-abc',
  tenantId: 3,
  isAgencyAdmin: false,
  isImpersonating: false,
  role: 'owner',
};

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidateCalls.push(path);
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (_table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const call: UpdateCall = { payload, filters: [] };
        updateCalls.push(call);
        const chain = {
          eq: (col: string, val: unknown) => {
            call.filters.push({ col, val });
            return chain;
          },
          then: (resolve: (v: { error: typeof updateError }) => unknown) =>
            Promise.resolve({ error: updateError }).then(resolve),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

import { togglePauseConversation } from '@/lib/actions/conversations';

describe('togglePauseConversation', () => {
  beforeEach(() => {
    updateCalls.length = 0;
    revalidateCalls.length = 0;
    updateError = null;
    mockEffectiveTenant = {
      userId: 'user-abc',
      tenantId: 3,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'owner',
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
  });

  it('rejects invalid conversationId (zero)', async () => {
    const result = await togglePauseConversation(0, false);
    expect(result).toEqual({ ok: false, error: 'invalid conversationId' });
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects invalid conversationId (negative)', async () => {
    const result = await togglePauseConversation(-1, false);
    expect(result).toEqual({ ok: false, error: 'invalid conversationId' });
  });

  it('rejects invalid conversationId (NaN)', async () => {
    const result = await togglePauseConversation(Number.NaN, false);
    expect(result).toEqual({ ok: false, error: 'invalid conversationId' });
  });

  it('returns unauthenticated when no effective tenant', async () => {
    mockEffectiveTenant = null;
    const result = await togglePauseConversation(10, false);
    expect(result).toEqual({ ok: false, error: 'unauthenticated' });
    expect(updateCalls).toHaveLength(0);
  });

  it('pause sets ai_paused_until=infinity scoped to tenant_id', async () => {
    const result = await togglePauseConversation(10, false);
    expect(result).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    const [call] = updateCalls;
    expect(call?.payload.ai_paused_until).toBe('infinity');
    expect(call?.payload.updated_at).toBeTypeOf('string');
    expect(call?.filters).toEqual([
      { col: 'id', val: 10 },
      { col: 'tenant_id', val: 3 },
    ]);
  });

  it('reactivate sets ai_paused_until=null scoped to tenant_id', async () => {
    const result = await togglePauseConversation(10, true);
    expect(result).toEqual({ ok: true });
    expect(updateCalls[0]?.payload.ai_paused_until).toBeNull();
  });

  it('triggers revalidate for /conversations and detail page', async () => {
    await togglePauseConversation(10, false);
    expect(revalidateCalls).toContain('/conversations');
    expect(revalidateCalls).toContain('/conversations/10');
  });

  it('honors impersonated tenant when agency admin acts', async () => {
    mockEffectiveTenant = {
      userId: 'user-admin',
      tenantId: 99,
      isAgencyAdmin: true,
      isImpersonating: true,
      role: 'owner',
    };
    await togglePauseConversation(10, false);
    expect(updateCalls[0]?.filters).toContainEqual({ col: 'tenant_id', val: 99 });
  });

  it('propagates supabase error', async () => {
    updateError = { message: 'connection refused' };
    const result = await togglePauseConversation(10, false);
    expect(result).toEqual({ ok: false, error: 'connection refused' });
    expect(revalidateCalls).toHaveLength(0);
  });
});
