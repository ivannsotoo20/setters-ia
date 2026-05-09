import { cookies } from 'next/headers';

/**
 * Cookie de impersonate del agency admin. Cuando un agency admin clica
 * "Entrar como [tenant X]" en `/admin/tenants/[id]`, esta cookie se setea con
 * el `tenant_id` del trainer. Las queries de las páginas tenant-scoped
 * (/dashboard, /conversations, /keywords, /settings/integrations) usan
 * `getEffectiveTenantId()` en vez del `profile.tenant_id` natural.
 *
 * El backend SIEMPRE valida que el usuario sea is_agency_admin antes de
 * respetar la cookie — un trainer normal con esa cookie no puede impersonar.
 */

const COOKIE_NAME = 'fyzon_impersonate_tenant_id';

export async function getImpersonateTenantId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setImpersonateTenantId(tenantId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, String(tenantId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
  });
}

export async function clearImpersonateTenantId(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Devuelve el tenant_id efectivo:
 *   - Si NO hay cookie → tenant del propio profile.
 *   - Si hay cookie Y el usuario es agency admin → cookie.
 *   - Si hay cookie pero el usuario NO es agency admin → ignora cookie.
 */
export async function resolveEffectiveTenantId(args: {
  profileTenantId: number;
  isAgencyAdmin: boolean;
}): Promise<{ tenantId: number; isImpersonating: boolean }> {
  if (!args.isAgencyAdmin) {
    return { tenantId: args.profileTenantId, isImpersonating: false };
  }
  const impersonateId = await getImpersonateTenantId();
  if (impersonateId == null) {
    return { tenantId: args.profileTenantId, isImpersonating: false };
  }
  return { tenantId: impersonateId, isImpersonating: true };
}
