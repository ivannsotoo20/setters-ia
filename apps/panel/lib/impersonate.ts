import { cookies, headers } from 'next/headers';

/**
 * Cookie de impersonate del agency admin. Cuando un agency admin clica
 * "Entrar como [tenant X]" en `/admin/tenants/[id]`, esta cookie se setea con
 * el `tenant_id` del trainer. Las queries de las páginas tenant-scoped
 * (/dashboard, /conversations, /keywords, /settings/integrations) usan
 * `getEffectiveTenantId()` en vez del `profile.tenant_id` natural.
 *
 * Hito 10.1 fix: dominio `.fyzon.es` para que la cookie viaje entre
 * admin.fyzon.es y panel.fyzon.es (el flujo "Entrar" cruza subdomain).
 *
 * El backend SIEMPRE valida que el usuario sea is_agency_admin antes de
 * respetar la cookie — un trainer normal con esa cookie no puede impersonar.
 */

const COOKIE_NAME = 'fyzon_impersonate_tenant_id';
const COOKIE_DOMAIN = '.fyzon.es';

/** Devuelve `.fyzon.es` cuando el request viene de un subdominio fyzon.es. */
async function getCookieDomain(): Promise<string | undefined> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    return host.endsWith('.fyzon.es') ? COOKIE_DOMAIN : undefined;
  } catch {
    return undefined;
  }
}

export async function getImpersonateTenantId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setImpersonateTenantId(tenantId: number): Promise<void> {
  const store = await cookies();
  const domain = await getCookieDomain();
  store.set(COOKIE_NAME, String(tenantId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
    ...(domain ? { domain } : {}),
  });
}

export async function clearImpersonateTenantId(): Promise<void> {
  const store = await cookies();
  const domain = await getCookieDomain();
  // Set con maxAge:0 + mismo domain/path que el set original es la forma
  // robusta de borrar la cookie (Next.js cookies.delete no siempre maneja
  // el domain explícito).
  store.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
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
