import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Epsilon.4 — tests para members CRUD
// =============================================================================

interface ProfileRow {
  id: string;
  tenant_id: number;
  email: string;
  full_name: string | null;
  role: 'owner' | 'admin' | 'viewer';
  is_active: boolean;
  is_agency_admin: boolean;
  invited_at: string | null;
  created_at: string;
}

let mockUser: { id: string } | null = { id: 'actor-uuid' };
let mockActorProfile: {
  tenant_id: number;
  is_agency_admin: boolean;
  role: 'owner' | 'admin' | 'viewer';
  is_active: boolean;
  email: string;
} | null = {
  tenant_id: 5,
  is_agency_admin: false,
  role: 'owner',
  is_active: true,
  email: 'owner@test.com',
};

let mockProfilesByTenant: ProfileRow[] = [];
let mockProfileByEmail: ProfileRow | null = null;
let mockProfileById: ProfileRow | null = null;

const insertedProfiles: Array<Record<string, unknown>> = [];
const updatedProfiles: Array<{ id: string; patch: Record<string, unknown> }> = [];
const auditLogInserts: Array<Record<string, unknown>> = [];
const inviteUserCalls: Array<{ email: string; data?: unknown; redirectTo?: string }> = [];
const resetPasswordCalls: Array<{ email: string; redirectTo?: string }> = [];

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () => {
            if (table === 'profiles') return { data: mockActorProfile };
            return { data: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceRoleClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, options?: { data?: unknown; redirectTo?: string }) => {
          inviteUserCalls.push({ email, data: options?.data, redirectTo: options?.redirectTo });
          return { data: { user: { id: 'new-invited-uuid' } }, error: null };
        },
        getUserById: async (_id: string) => ({ data: { user: { email_confirmed_at: null } }, error: null }),
      },
      resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
        resetPasswordCalls.push({ email, redirectTo: options?.redirectTo });
        return { error: null };
      },
    },
    from: (table: string) => {
      if (table === 'tenant_audit_log') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            auditLogInserts.push(payload);
            return { error: null };
          },
        };
      }
      // profiles table
      return {
        select: (_cols: string) => {
          const builder = {
            eq: (col: string, _val: unknown) => {
              if (col === 'tenant_id') {
                return {
                  order: () => ({
                    then: (resolve: (v: { data: ProfileRow[]; error: null }) => unknown) =>
                      Promise.resolve({ data: mockProfilesByTenant, error: null }).then(resolve),
                  }),
                };
              }
              if (col === 'email') {
                return {
                  maybeSingle: async () => ({ data: mockProfileByEmail }),
                };
              }
              if (col === 'id') {
                return {
                  maybeSingle: async () => ({ data: mockProfileById }),
                };
              }
              return builder;
            },
            order: () => ({
              then: (resolve: (v: { data: ProfileRow[]; error: null }) => unknown) =>
                Promise.resolve({ data: mockProfilesByTenant, error: null }).then(resolve),
            }),
          };
          return builder;
        },
        insert: async (payload: Record<string, unknown>) => {
          insertedProfiles.push(payload);
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, val: unknown) => {
            updatedProfiles.push({ id: String(val), patch });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  }),
}));

import {
  inviteMember,
  resetMemberPassword,
  changeMemberRole,
  removeMember,
  listMembers,
} from '@/lib/actions/members';

describe('members actions', () => {
  beforeEach(() => {
    mockUser = { id: 'actor-uuid' };
    mockActorProfile = {
      tenant_id: 5,
      is_agency_admin: false,
      role: 'owner',
      is_active: true,
      email: 'owner@test.com',
    };
    mockProfilesByTenant = [];
    mockProfileByEmail = null;
    mockProfileById = null;
    insertedProfiles.length = 0;
    updatedProfiles.length = 0;
    auditLogInserts.length = 0;
    inviteUserCalls.length = 0;
    resetPasswordCalls.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    process.env.NEXT_PUBLIC_PANEL_BASE_URL = 'https://panel.test';
  });

  describe('inviteMember', () => {
    it('owner invita nuevo miembro: crea auth user + profile + audit', async () => {
      const result = await inviteMember({
        tenantId: 5,
        email: 'NEW@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(true);
      expect(inviteUserCalls).toHaveLength(1);
      expect(inviteUserCalls[0]?.email).toBe('new@test.com');
      expect(insertedProfiles).toHaveLength(1);
      expect(insertedProfiles[0]).toMatchObject({
        id: 'new-invited-uuid',
        tenant_id: 5,
        email: 'new@test.com',
        role: 'admin',
        is_active: true,
      });
      expect(auditLogInserts).toHaveLength(1);
      expect(auditLogInserts[0]).toMatchObject({
        action: 'member.invited',
        target_email: 'new@test.com',
      });
    });

    it('rechaza email inválido', async () => {
      const result = await inviteMember({
        tenantId: 5,
        email: 'no-es-email',
        role: 'admin',
      });
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(/email/i);
      expect(inviteUserCalls).toHaveLength(0);
    });

    it('rechaza role inválido', async () => {
      const result = await inviteMember({
        tenantId: 5,
        email: 'ok@test.com',
        // @ts-expect-error: testing invalid input
        role: 'invalid',
      });
      expect(result.ok).toBe(false);
    });

    it('admin (collaborator) NO puede invitar (solo owner)', async () => {
      mockActorProfile = { ...mockActorProfile!, role: 'admin' };
      const result = await inviteMember({
        tenantId: 5,
        email: 'ok@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(false);
    });

    it('agency admin puede invitar a cualquier tenant', async () => {
      mockActorProfile = {
        ...mockActorProfile!,
        is_agency_admin: true,
        tenant_id: 1,
        role: 'owner',
      };
      const result = await inviteMember({
        tenantId: 99,
        email: 'ok@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(true);
    });

    it('reactiva profile soft-removed con mismo email + tenant', async () => {
      mockProfileByEmail = {
        id: 'existing-uuid',
        tenant_id: 5,
        email: 'reactivate@test.com',
        full_name: null,
        role: 'admin',
        is_active: false,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await inviteMember({
        tenantId: 5,
        email: 'reactivate@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(true);
      expect((result as { data: { sent: boolean } }).data.sent).toBe(false);
      expect(updatedProfiles[0]).toMatchObject({
        id: 'existing-uuid',
        patch: expect.objectContaining({ is_active: true, role: 'admin' }),
      });
      expect(auditLogInserts[0]).toMatchObject({ action: 'member.reactivated' });
    });

    it('rechaza si email ya está activo en mismo tenant', async () => {
      mockProfileByEmail = {
        id: 'existing-uuid',
        tenant_id: 5,
        email: 'existing@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await inviteMember({
        tenantId: 5,
        email: 'existing@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(false);
    });

    it('rechaza si email pertenece a otro tenant', async () => {
      mockProfileByEmail = {
        id: 'existing-uuid',
        tenant_id: 99,
        email: 'foreign@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await inviteMember({
        tenantId: 5,
        email: 'foreign@test.com',
        role: 'admin',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('resetMemberPassword', () => {
    it('owner resetea password de su tenant: dispara reset + audit', async () => {
      mockProfileById = {
        id: 'target-uuid',
        tenant_id: 5,
        email: 'colab@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await resetMemberPassword({ tenantId: 5, userId: 'target-uuid' });
      expect(result.ok).toBe(true);
      expect(resetPasswordCalls[0]?.email).toBe('colab@test.com');
      expect(auditLogInserts[0]).toMatchObject({ action: 'member.password_reset' });
    });

    it('rechaza si miembro no pertenece al tenant', async () => {
      mockProfileById = {
        id: 'target-uuid',
        tenant_id: 99,
        email: 'foreign@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await resetMemberPassword({ tenantId: 5, userId: 'target-uuid' });
      expect(result.ok).toBe(false);
      expect(resetPasswordCalls).toHaveLength(0);
    });

    it('admin (collaborator) NO puede resetear (solo owner)', async () => {
      mockActorProfile = { ...mockActorProfile!, role: 'admin' };
      const result = await resetMemberPassword({ tenantId: 5, userId: 'target-uuid' });
      expect(result.ok).toBe(false);
    });
  });

  describe('changeMemberRole', () => {
    it('owner cambia rol: UPDATE + audit', async () => {
      mockProfileById = {
        id: 'target-uuid',
        tenant_id: 5,
        email: 'colab@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await changeMemberRole({
        tenantId: 5,
        userId: 'target-uuid',
        newRole: 'owner',
      });
      expect(result.ok).toBe(true);
      expect(updatedProfiles[0]?.patch).toMatchObject({ role: 'owner' });
      expect(auditLogInserts[0]).toMatchObject({
        action: 'member.role_changed',
        metadata: { from: 'admin', to: 'owner' },
      });
    });

    it('no-op si rol idéntico', async () => {
      mockProfileById = {
        id: 'target-uuid',
        tenant_id: 5,
        email: 'colab@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await changeMemberRole({
        tenantId: 5,
        userId: 'target-uuid',
        newRole: 'admin',
      });
      expect(result.ok).toBe(true);
      expect(updatedProfiles).toHaveLength(0);
    });
  });

  describe('removeMember', () => {
    it('owner soft-remueve un colaborador', async () => {
      mockProfileById = {
        id: 'target-uuid',
        tenant_id: 5,
        email: 'colab@test.com',
        full_name: null,
        role: 'admin',
        is_active: true,
        is_agency_admin: false,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await removeMember({ tenantId: 5, userId: 'target-uuid' });
      expect(result.ok).toBe(true);
      expect(updatedProfiles[0]?.patch).toMatchObject({ is_active: false });
      expect(auditLogInserts[0]).toMatchObject({ action: 'member.removed' });
    });

    it('owner NO puede quitarse a sí mismo', async () => {
      const result = await removeMember({ tenantId: 5, userId: 'actor-uuid' });
      expect(result.ok).toBe(false);
    });

    it('rechaza quitar a un agency admin', async () => {
      mockProfileById = {
        id: 'admin-uuid',
        tenant_id: 5,
        email: 'admin@test.com',
        full_name: null,
        role: 'owner',
        is_active: true,
        is_agency_admin: true,
        invited_at: null,
        created_at: '2026-01-01',
      };
      const result = await removeMember({ tenantId: 5, userId: 'admin-uuid' });
      expect(result.ok).toBe(false);
    });
  });

  describe('listMembers', () => {
    it('viewer puede listar (read access)', async () => {
      mockActorProfile = { ...mockActorProfile!, role: 'viewer' };
      mockProfilesByTenant = [
        {
          id: 'a',
          tenant_id: 5,
          email: 'a@test.com',
          full_name: null,
          role: 'owner',
          is_active: true,
          is_agency_admin: false,
          invited_at: null,
          created_at: '2026-01-01',
        },
      ];
      const result = await listMembers({ tenantId: 5 });
      expect(result.ok).toBe(true);
      expect((result as { data: unknown[] }).data).toHaveLength(1);
    });

    it('rechaza si tenant no es del actor (no agency admin)', async () => {
      mockActorProfile = { ...mockActorProfile!, tenant_id: 5 };
      const result = await listMembers({ tenantId: 99 });
      expect(result.ok).toBe(false);
    });
  });
});
