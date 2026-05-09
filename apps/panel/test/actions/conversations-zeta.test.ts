import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Zeta — tests para nuevas acciones de panel chat
// =============================================================================

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

interface InsertCall {
  table: string;
  payload: Record<string, unknown>;
}

interface DeleteCall {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
}

const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
const deleteCalls: DeleteCall[] = [];
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

let mockConvRow: { tenant_id: number } | null = { tenant_id: 5 };
let mockProfileRow: { email: string } | null = { email: 'owner@test.com' };
let mockTargetUserProfile: { tenant_id: number; is_active: boolean } | null = null;
let insertReturnRow: { id: number } | null = { id: 999 };
let listNotesRows: Array<{
  id: number;
  author_email: string | null;
  content: string;
  created_at: string;
}> = [];

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
            eq: (col: string, val: unknown) => {
              const sub2 = {
                eq: (_c2: string, _v2: unknown) => sub2,
                maybeSingle: async () => {
                  if (table === 'conversations') return { data: mockConvRow };
                  if (table === 'profiles') {
                    if (col === 'id' && val === 'actor-uuid') return { data: mockProfileRow };
                    return { data: mockTargetUserProfile };
                  }
                  return { data: null };
                },
                single: async () => ({ data: insertReturnRow }),
                order: () => ({
                  then: (resolve: (v: { data: typeof listNotesRows; error: null }) => unknown) =>
                    Promise.resolve({ data: listNotesRows, error: null }).then(resolve),
                }),
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
              single: async () => ({ data: insertReturnRow, error: null }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const call: UpdateCall = { table, payload, filters: [] };
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
          const call: DeleteCall = { table, filters: [] };
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

import {
  setConversationUnread,
  setConversationBlocked,
  assignConversation,
  addConversationNote,
  deleteConversationNote,
  listConversationNotes,
  deleteConversation,
} from '@/lib/actions/conversations';

describe('Sprint Zeta server actions', () => {
  beforeEach(() => {
    updateCalls.length = 0;
    insertCalls.length = 0;
    deleteCalls.length = 0;
    revalidateCalls.length = 0;
    mockEffectiveTenant = {
      userId: 'actor-uuid',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'owner',
    };
    mockConvRow = { tenant_id: 5 };
    mockProfileRow = { email: 'owner@test.com' };
    mockTargetUserProfile = null;
    insertReturnRow = { id: 999 };
    listNotesRows = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
  });

  describe('setConversationUnread', () => {
    it('OK marca como no leído scoped al tenant', async () => {
      const result = await setConversationUnread(10, true);
      expect(result.ok).toBe(true);
      const updateCall = updateCalls.find((c) => c.table === 'conversations');
      expect(updateCall?.payload.is_unread).toBe(true);
      expect(updateCall?.filters).toContainEqual({ col: 'tenant_id', val: 5 });
    });

    it('rechaza conversación de otro tenant (no agency admin)', async () => {
      mockConvRow = { tenant_id: 99 };
      const result = await setConversationUnread(10, true);
      expect(result.ok).toBe(false);
    });

    it('agency admin puede marcar conversaciones de cualquier tenant', async () => {
      mockEffectiveTenant = { ...mockEffectiveTenant!, isAgencyAdmin: true };
      mockConvRow = { tenant_id: 99 };
      const result = await setConversationUnread(10, true);
      expect(result.ok).toBe(true);
    });

    it('rechaza conversationId inválido', async () => {
      const result = await setConversationUnread(0, true);
      expect(result.ok).toBe(false);
    });
  });

  describe('setConversationBlocked', () => {
    it('owner bloquea: setea is_blocked + pausa IA defensiva', async () => {
      const result = await setConversationBlocked(10, true);
      expect(result.ok).toBe(true);
      const updateCall = updateCalls.find((c) => c.table === 'conversations');
      expect(updateCall?.payload.is_blocked).toBe(true);
      expect(updateCall?.payload.ai_paused_until).toBe('infinity');
    });

    it('owner desbloquea: NO toca ai_paused_until', async () => {
      const result = await setConversationBlocked(10, false);
      expect(result.ok).toBe(true);
      const updateCall = updateCalls.find((c) => c.table === 'conversations');
      expect(updateCall?.payload.is_blocked).toBe(false);
      expect(updateCall?.payload.ai_paused_until).toBeUndefined();
    });

    it('collaborator (admin) NO puede bloquear', async () => {
      mockEffectiveTenant = { ...mockEffectiveTenant!, role: 'admin' };
      const result = await setConversationBlocked(10, true);
      expect(result.ok).toBe(false);
    });
  });

  describe('assignConversation', () => {
    it('OK asignar a usuario válido del tenant', async () => {
      mockTargetUserProfile = { tenant_id: 5, is_active: true };
      const result = await assignConversation(10, 'target-uuid');
      expect(result.ok).toBe(true);
      const updateCall = updateCalls.find((c) => c.table === 'conversations');
      expect(updateCall?.payload.assigned_user_id).toBe('target-uuid');
    });

    it('OK desasignar (null)', async () => {
      const result = await assignConversation(10, null);
      expect(result.ok).toBe(true);
    });

    it('rechaza asignar a usuario de otro tenant', async () => {
      mockTargetUserProfile = { tenant_id: 99, is_active: true };
      const result = await assignConversation(10, 'foreign-uuid');
      expect(result.ok).toBe(false);
    });

    it('rechaza asignar a usuario inactivo', async () => {
      mockTargetUserProfile = { tenant_id: 5, is_active: false };
      const result = await assignConversation(10, 'inactive-uuid');
      expect(result.ok).toBe(false);
    });
  });

  describe('addConversationNote', () => {
    it('OK añade nota con autor', async () => {
      const result = await addConversationNote(10, 'Lead pidió tiempo, follow-up en 2 días');
      expect(result.ok).toBe(true);
      const insertCall = insertCalls.find((c) => c.table === 'conversation_notes');
      expect(insertCall?.payload).toMatchObject({
        conversation_id: 10,
        tenant_id: 5,
        author_user_id: 'actor-uuid',
        author_email: 'owner@test.com',
        content: 'Lead pidió tiempo, follow-up en 2 días',
      });
    });

    it('rechaza nota vacía', async () => {
      const result = await addConversationNote(10, '   ');
      expect(result.ok).toBe(false);
    });

    it('rechaza nota >4000 chars', async () => {
      const long = 'x'.repeat(4001);
      const result = await addConversationNote(10, long);
      expect(result.ok).toBe(false);
    });
  });

  describe('deleteConversationNote', () => {
    it('OK borra nota scoped a tenant + conv', async () => {
      const result = await deleteConversationNote(10, 50);
      expect(result.ok).toBe(true);
      const deleteCall = deleteCalls.find((c) => c.table === 'conversation_notes');
      expect(deleteCall?.filters).toContainEqual({ col: 'id', val: 50 });
      expect(deleteCall?.filters).toContainEqual({ col: 'tenant_id', val: 5 });
    });
  });

  describe('listConversationNotes', () => {
    it('devuelve notas mapeadas', async () => {
      listNotesRows = [
        { id: 1, author_email: 'a@test.com', content: 'nota 1', created_at: '2026-05-09' },
        { id: 2, author_email: null, content: 'nota 2', created_at: '2026-05-08' },
      ];
      const result = await listConversationNotes(10);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        expect(result.data?.[0]?.authorEmail).toBe('a@test.com');
      }
    });
  });

  describe('deleteConversation (soft)', () => {
    it('owner soft-elimina: state=closed, blocked, paused', async () => {
      const result = await deleteConversation(10);
      expect(result.ok).toBe(true);
      const updateCall = updateCalls.find((c) => c.table === 'conversations');
      expect(updateCall?.payload).toMatchObject({
        state: 'closed',
        is_blocked: true,
        ai_paused_until: 'infinity',
      });
    });

    it('collaborator NO puede eliminar', async () => {
      mockEffectiveTenant = { ...mockEffectiveTenant!, role: 'admin' };
      const result = await deleteConversation(10);
      expect(result.ok).toBe(false);
    });
  });
});
