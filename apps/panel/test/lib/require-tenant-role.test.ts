import { describe, it, expect, beforeEach, vi } from 'vitest';

interface ProfileRow {
  tenant_id: number | null;
  is_agency_admin: boolean | null;
  role: 'owner' | 'admin' | 'viewer' | null;
  is_active: boolean | null;
  email: string | null;
}

let mockUser: { id: string } | null = { id: 'user-abc' };
let mockProfile: ProfileRow | null = {
  tenant_id: 1,
  is_agency_admin: false,
  role: 'owner',
  is_active: true,
  email: 'owner@test.com',
};

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () => ({ data: mockProfile }),
        }),
      }),
    }),
  }),
}));

import {
  AuthError,
  requireAgencyAdmin,
  requireTenantRole,
  requireTenantRoleAtLeast,
} from '@/lib/auth/require-tenant-role';

describe('requireTenantRole', () => {
  beforeEach(() => {
    mockUser = { id: 'user-abc' };
    mockProfile = {
      tenant_id: 1,
      is_agency_admin: false,
      role: 'owner',
      is_active: true,
      email: 'owner@test.com',
    };
  });

  it('UNAUTHENTICATED si no hay user', async () => {
    mockUser = null;
    await expect(requireTenantRole({ tenantId: 1 })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('PROFILE_NOT_FOUND si no hay profile', async () => {
    mockProfile = null;
    await expect(requireTenantRole({ tenantId: 1 })).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
    });
  });

  it('PROFILE_INACTIVE si is_active=false', async () => {
    mockProfile = { ...mockProfile!, is_active: false };
    await expect(requireTenantRole({ tenantId: 1 })).rejects.toMatchObject({
      code: 'PROFILE_INACTIVE',
    });
  });

  it('agency admin OK aunque tenantId no coincida', async () => {
    mockProfile = { ...mockProfile!, is_agency_admin: true, tenant_id: 1 };
    const ctx = await requireTenantRole({ tenantId: 99 });
    expect(ctx.effectiveRole).toBe('agency_admin');
    expect(ctx.isAgencyAdmin).toBe(true);
  });

  it('agency admin denegado si allowAgencyAdmin=false y tenant no matchea', async () => {
    mockProfile = { ...mockProfile!, is_agency_admin: true, tenant_id: 1 };
    await expect(
      requireTenantRole({ tenantId: 99, allowAgencyAdmin: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_WRONG_TENANT' });
  });

  it('owner OK en su tenant sin pedir role específico', async () => {
    mockProfile = { ...mockProfile!, tenant_id: 5, role: 'owner' };
    const ctx = await requireTenantRole({ tenantId: 5 });
    expect(ctx.effectiveRole).toBe('owner');
    expect(ctx.isAgencyAdmin).toBe(false);
  });

  it('FORBIDDEN_WRONG_TENANT si no es admin y tenant no matchea', async () => {
    mockProfile = { ...mockProfile!, tenant_id: 5, role: 'owner' };
    await expect(requireTenantRole({ tenantId: 99 })).rejects.toMatchObject({
      code: 'FORBIDDEN_WRONG_TENANT',
    });
  });

  it('admin user falla cuando se pide role=owner exacto', async () => {
    mockProfile = { ...mockProfile!, tenant_id: 5, role: 'admin' };
    await expect(
      requireTenantRole({ tenantId: 5, role: 'owner' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE_REQUIRED' });
  });

  it('owner OK cuando se pide role=owner exacto', async () => {
    mockProfile = { ...mockProfile!, tenant_id: 5, role: 'owner' };
    const ctx = await requireTenantRole({ tenantId: 5, role: 'owner' });
    expect(ctx.effectiveRole).toBe('owner');
  });
});

describe('requireTenantRoleAtLeast (jerarquía owner > admin > viewer)', () => {
  beforeEach(() => {
    mockUser = { id: 'user-abc' };
    mockProfile = {
      tenant_id: 5,
      is_agency_admin: false,
      role: 'owner',
      is_active: true,
      email: 'owner@test.com',
    };
  });

  it('owner pasa minRole=admin', async () => {
    mockProfile = { ...mockProfile!, role: 'owner' };
    const ctx = await requireTenantRoleAtLeast({ tenantId: 5, minRole: 'admin' });
    expect(ctx.effectiveRole).toBe('owner');
  });

  it('admin pasa minRole=admin', async () => {
    mockProfile = { ...mockProfile!, role: 'admin' };
    const ctx = await requireTenantRoleAtLeast({ tenantId: 5, minRole: 'admin' });
    expect(ctx.effectiveRole).toBe('admin');
  });

  it('viewer NO pasa minRole=admin', async () => {
    mockProfile = { ...mockProfile!, role: 'viewer' };
    await expect(
      requireTenantRoleAtLeast({ tenantId: 5, minRole: 'admin' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE_REQUIRED' });
  });

  it('admin NO pasa minRole=owner', async () => {
    mockProfile = { ...mockProfile!, role: 'admin' };
    await expect(
      requireTenantRoleAtLeast({ tenantId: 5, minRole: 'owner' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE_REQUIRED' });
  });

  it('agency admin pasa cualquier minRole', async () => {
    mockProfile = { ...mockProfile!, is_agency_admin: true, tenant_id: 1 };
    const ctx = await requireTenantRoleAtLeast({ tenantId: 99, minRole: 'owner' });
    expect(ctx.effectiveRole).toBe('agency_admin');
  });
});

describe('requireAgencyAdmin', () => {
  beforeEach(() => {
    mockUser = { id: 'user-abc' };
    mockProfile = {
      tenant_id: 1,
      is_agency_admin: true,
      role: 'owner',
      is_active: true,
      email: 'admin@test.com',
    };
  });

  it('OK cuando is_agency_admin=true', async () => {
    const ctx = await requireAgencyAdmin();
    expect(ctx.effectiveRole).toBe('agency_admin');
    expect(ctx.isAgencyAdmin).toBe(true);
  });

  it('FORBIDDEN_AGENCY_ADMIN_REQUIRED cuando is_agency_admin=false', async () => {
    mockProfile = { ...mockProfile!, is_agency_admin: false };
    await expect(requireAgencyAdmin()).rejects.toMatchObject({
      code: 'FORBIDDEN_AGENCY_ADMIN_REQUIRED',
    });
  });

  it('UNAUTHENTICATED si no hay user', async () => {
    mockUser = null;
    await expect(requireAgencyAdmin()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('PROFILE_INACTIVE bloquea aunque sea admin', async () => {
    mockProfile = { ...mockProfile!, is_active: false };
    await expect(requireAgencyAdmin()).rejects.toMatchObject({
      code: 'PROFILE_INACTIVE',
    });
  });
});

describe('AuthError', () => {
  it('expone code y required role para FORBIDDEN_ROLE_REQUIRED', () => {
    const err = new AuthError('FORBIDDEN_ROLE_REQUIRED', 'owner');
    expect(err.code).toBe('FORBIDDEN_ROLE_REQUIRED');
    expect(err.required).toBe('owner');
    expect(err.name).toBe('AuthError');
  });
});
