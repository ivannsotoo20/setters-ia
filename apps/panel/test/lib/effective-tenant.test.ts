import { describe, it, expect, beforeEach, vi } from 'vitest';

interface ProfileRow {
  tenant_id: number | null;
  is_agency_admin: boolean | null;
}

let mockUser: { id: string } | null = { id: 'user-abc' };
let mockProfile: ProfileRow | null = { tenant_id: 1, is_agency_admin: false };
const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: () => {},
    delete: () => {},
  }),
}));

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

import { getEffectiveTenant } from '@/lib/effective-tenant';

describe('getEffectiveTenant', () => {
  beforeEach(() => {
    mockUser = { id: 'user-abc' };
    mockProfile = { tenant_id: 1, is_agency_admin: false };
    cookieStore.clear();
  });

  it('returns null when user is unauthenticated', async () => {
    mockUser = null;
    const result = await getEffectiveTenant();
    expect(result).toBeNull();
  });

  it('returns null when profile is missing', async () => {
    mockProfile = null;
    const result = await getEffectiveTenant();
    expect(result).toBeNull();
  });

  it('returns null when profile has no tenant_id', async () => {
    mockProfile = { tenant_id: null, is_agency_admin: false };
    const result = await getEffectiveTenant();
    expect(result).toBeNull();
  });

  it('non-admin returns own tenant, isImpersonating=false', async () => {
    mockProfile = { tenant_id: 5, is_agency_admin: false };
    const result = await getEffectiveTenant();
    expect(result).toEqual({
      userId: 'user-abc',
      tenantId: 5,
      isAgencyAdmin: false,
      isImpersonating: false,
      role: 'owner',
    });
  });

  it('non-admin with impersonate cookie still gets own tenant (cookie ignored)', async () => {
    mockProfile = { tenant_id: 5, is_agency_admin: false };
    cookieStore.set('fyzon_impersonate_tenant_id', '99');
    const result = await getEffectiveTenant();
    expect(result?.tenantId).toBe(5);
    expect(result?.isImpersonating).toBe(false);
  });

  it('agency admin without cookie returns own tenant, isAgencyAdmin=true', async () => {
    mockProfile = { tenant_id: 1, is_agency_admin: true };
    const result = await getEffectiveTenant();
    expect(result).toEqual({
      userId: 'user-abc',
      tenantId: 1,
      isAgencyAdmin: true,
      isImpersonating: false,
      role: 'owner',
    });
  });

  it('agency admin with cookie returns impersonated tenant', async () => {
    mockProfile = { tenant_id: 1, is_agency_admin: true };
    cookieStore.set('fyzon_impersonate_tenant_id', '42');
    const result = await getEffectiveTenant();
    expect(result).toEqual({
      userId: 'user-abc',
      tenantId: 42,
      isAgencyAdmin: true,
      isImpersonating: true,
      role: 'owner',
    });
  });

  it('agency admin flag treated strictly as boolean true (not truthy)', async () => {
    // is_agency_admin === null debe contar como NO admin → cookie ignorada
    mockProfile = { tenant_id: 5, is_agency_admin: null };
    cookieStore.set('fyzon_impersonate_tenant_id', '99');
    const result = await getEffectiveTenant();
    expect(result?.tenantId).toBe(5);
    expect(result?.isAgencyAdmin).toBe(false);
    expect(result?.isImpersonating).toBe(false);
    expect(result?.role).toBe('owner');
  });
});
