import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Tests para `sendManualMessage` — cobertura de validación temprana.
// El envío real al provider se testea en motor + smoke manual; aquí cubrimos
// los rejection paths que son críticos para no enviar basura.
// =============================================================================

const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}> = [];
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

let mockConvRow: { tenant_id: number; is_blocked?: boolean } | null = {
  tenant_id: 5,
  is_blocked: false,
};
let mockProfileRow: { email: string } | null = { email: 'owner@test.com' };
let mockSendDirectShouldFail = false;
const sendDirectCalls: Array<{ conversationId: number; text: string }> = [];

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidateCalls.push(path);
  },
}));

vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));

// Mock del lazy import de manual-send
vi.mock('@/lib/manual-send', () => ({
  sendManualMessageDirect: async (params: { conversationId: number; text: string }) => {
    sendDirectCalls.push({ conversationId: params.conversationId, text: params.text });
    if (mockSendDirectShouldFail) {
      throw new Error('provider boom');
    }
    return { providerMessageId: 'prov-msg-1' };
  },
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
                maybeSingle: async () => {
                  if (table === 'conversations') return { data: mockConvRow };
                  if (table === 'profiles') return { data: mockProfileRow };
                  return { data: null };
                },
                single: async () => ({ data: { id: 999 }, error: null }),
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
              single: async () => ({ data: { id: 999 }, error: null }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const call = { table, payload, filters: [] as Array<{ col: string; val: unknown }> };
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
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  revalidateCalls.length = 0;
  sendDirectCalls.length = 0;
  mockEffectiveTenant = {
    userId: 'actor-uuid',
    tenantId: 5,
    isAgencyAdmin: false,
    isImpersonating: false,
    role: 'owner',
  };
  mockConvRow = { tenant_id: 5, is_blocked: false };
  mockSendDirectShouldFail = false;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://stub';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
});

describe('sendManualMessage — auth + validation', () => {
  it('rechaza si no hay sesión', async () => {
    mockEffectiveTenant = null;
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola');
    expect(res.ok).toBe(false);
  });

  it('rechaza si viewer (rol viewer no puede enviar)', async () => {
    mockEffectiveTenant = {
      userId: 'actor-uuid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'viewer',
    };
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/viewer/);
  });

  it('permite agency admin aunque no tenga role owner del tenant', async () => {
    mockEffectiveTenant = {
      userId: 'actor-uuid',
      tenantId: 5,
      isAgencyAdmin: true,
      isImpersonating: true,
      role: 'viewer',
    };
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola');
    expect(res.ok).toBe(true);
  });

  it('rechaza mensaje vacío', async () => {
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, '   ');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/vacío/);
  });

  it('rechaza mensaje >4000 chars', async () => {
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const longText = 'a'.repeat(4001);
    const res = await sendManualMessage(123, longText);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/largo|4000/);
  });

  it('rechaza si conversación bloqueada', async () => {
    mockConvRow = { tenant_id: 5, is_blocked: true };
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/bloqueada/);
  });
});

describe('sendManualMessage — happy path', () => {
  it('en éxito: llama provider, INSERT mensaje human, UPDATE ai_paused_until=infinity', async () => {
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola lead');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.providerMessageId).toBe('prov-msg-1');
    }

    // Provider llamado con conversationId + text
    expect(sendDirectCalls).toHaveLength(1);
    expect(sendDirectCalls[0]).toEqual({ conversationId: 123, text: 'hola lead' });

    // INSERT mensaje human
    const insertMsg = insertCalls.find((c) => c.table === 'conversation_messages');
    expect(insertMsg).toBeDefined();
    expect(insertMsg?.payload.source).toBe('human');
    expect(insertMsg?.payload.content).toBe('hola lead');
    expect(insertMsg?.payload.tenant_id).toBe(5);

    // UPDATE auto-pause IA
    const updateAi = updateCalls.find(
      (c) => c.table === 'conversations' && c.payload.ai_paused_until === 'infinity',
    );
    expect(updateAi).toBeDefined();

    // revalidate paths
    expect(revalidateCalls).toContain('/conversations');
    expect(revalidateCalls).toContain('/conversations/123');
  });

  it('en fallo del provider: NO inserta mensaje ni pausa IA', async () => {
    mockSendDirectShouldFail = true;
    const { sendManualMessage } = await import('../../lib/actions/conversations');
    const res = await sendManualMessage(123, 'hola');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/proveedor|provider boom/i);

    // No INSERT, no UPDATE de pausa
    expect(insertCalls.find((c) => c.table === 'conversation_messages')).toBeUndefined();
    expect(updateCalls.find((c) => c.payload.ai_paused_until === 'infinity')).toBeUndefined();
  });
});
