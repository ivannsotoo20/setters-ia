import { describe, it, expect, beforeEach, vi } from 'vitest';

interface SetCall {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const cookieStore = new Map<string, string>();
const setCalls: SetCall[] = [];
const deleteCalls: string[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieStore.set(name, value);
      setCalls.push({ name, value, options });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
      deleteCalls.push(name);
    },
  }),
}));

import {
  getImpersonateTenantId,
  setImpersonateTenantId,
  clearImpersonateTenantId,
  resolveEffectiveTenantId,
} from '@/lib/impersonate';

describe('impersonate cookie helpers', () => {
  beforeEach(() => {
    cookieStore.clear();
    setCalls.length = 0;
    deleteCalls.length = 0;
  });

  it('getImpersonateTenantId returns null when cookie missing', async () => {
    expect(await getImpersonateTenantId()).toBeNull();
  });

  it('getImpersonateTenantId parses positive integer cookies', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', '42');
    expect(await getImpersonateTenantId()).toBe(42);
  });

  it('getImpersonateTenantId rejects non-numeric values', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', 'abc');
    expect(await getImpersonateTenantId()).toBeNull();
  });

  it('getImpersonateTenantId rejects zero and negative numbers', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', '0');
    expect(await getImpersonateTenantId()).toBeNull();
    cookieStore.set('fyzon_impersonate_tenant_id', '-5');
    expect(await getImpersonateTenantId()).toBeNull();
  });

  it('setImpersonateTenantId writes httpOnly cookie with maxAge 12h', async () => {
    await setImpersonateTenantId(7);
    expect(setCalls).toHaveLength(1);
    const [call] = setCalls;
    expect(call?.name).toBe('fyzon_impersonate_tenant_id');
    expect(call?.value).toBe('7');
    expect(call?.options?.httpOnly).toBe(true);
    expect(call?.options?.sameSite).toBe('lax');
    expect(call?.options?.path).toBe('/');
    expect(call?.options?.maxAge).toBe(60 * 60 * 12);
  });

  it('setImpersonateTenantId sets secure=false in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await setImpersonateTenantId(8);
    expect(setCalls[0]?.options?.secure).toBe(false);
    vi.unstubAllEnvs();
  });

  it('clearImpersonateTenantId deletes the cookie', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', '99');
    await clearImpersonateTenantId();
    expect(deleteCalls).toEqual(['fyzon_impersonate_tenant_id']);
    expect(cookieStore.has('fyzon_impersonate_tenant_id')).toBe(false);
  });
});

describe('resolveEffectiveTenantId security boundary', () => {
  beforeEach(() => {
    cookieStore.clear();
    setCalls.length = 0;
  });

  it('non-admin user always gets own tenant, ignoring cookie', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', '99');
    const result = await resolveEffectiveTenantId({
      profileTenantId: 5,
      isAgencyAdmin: false,
    });
    expect(result).toEqual({ tenantId: 5, isImpersonating: false });
  });

  it('agency admin without cookie gets own tenant', async () => {
    const result = await resolveEffectiveTenantId({
      profileTenantId: 1,
      isAgencyAdmin: true,
    });
    expect(result).toEqual({ tenantId: 1, isImpersonating: false });
  });

  it('agency admin with cookie gets impersonated tenant', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', '42');
    const result = await resolveEffectiveTenantId({
      profileTenantId: 1,
      isAgencyAdmin: true,
    });
    expect(result).toEqual({ tenantId: 42, isImpersonating: true });
  });

  it('agency admin with malformed cookie falls back to own tenant', async () => {
    cookieStore.set('fyzon_impersonate_tenant_id', 'garbage');
    const result = await resolveEffectiveTenantId({
      profileTenantId: 1,
      isAgencyAdmin: true,
    });
    expect(result).toEqual({ tenantId: 1, isImpersonating: false });
  });
});
