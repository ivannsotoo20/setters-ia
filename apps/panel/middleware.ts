import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Refresca la cookie de sesión Supabase en cada request y aplica gating por:
 *   1) Hostname (Hito 10.1): admin.fyzon.es ↔ panel.fyzon.es son shells separados.
 *      Rutas admin solo en admin.fyzon.es, rutas trainer solo en panel.fyzon.es.
 *   2) Path (auth gating clásico): protege/redirige según presence de sesión.
 *
 * Cookies se setean con `domain=.fyzon.es` en producción para compartir sesión
 * entre subdomains. En localhost dejamos el default.
 *
 * NO leer datos sensibles aquí (Edge runtime). Solo gating + redirects.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/conversations', '/contacts', '/pipeline', '/settings', '/keywords', '/labels', '/onboarding', '/admin'];
const TRAINER_PREFIXES = ['/dashboard', '/conversations', '/contacts', '/pipeline', '/settings', '/keywords', '/labels', '/onboarding'];
const ADMIN_PREFIXES = ['/admin'];
/** Rutas que SOLO se muestran cuando NO hay sesión (login/signup-like). */
const AUTH_ONLY_PATHS = ['/login', '/admin/login', '/forgot-password'];
/** Rutas siempre accesibles sin auth (token-based o post-click email). */
const ALWAYS_PUBLIC_PATHS = ['/accept-invite', '/reset-password'];
/** Rutas accesibles SOLO para owner del tenant o agency admin. */
const OWNER_ONLY_PREFIXES = ['/settings/integrations', '/settings/preferences'];

const ADMIN_HOST = 'admin.fyzon.es';
const PANEL_HOST = 'panel.fyzon.es';
const COOKIE_DOMAIN = '.fyzon.es';

type HostMode = 'admin' | 'panel' | 'dev';

function classifyHost(hostname: string): HostMode {
  if (hostname === ADMIN_HOST) return 'admin';
  if (hostname === PANEL_HOST) return 'panel';
  return 'dev'; // localhost, vercel.app preview, cualquier otro
}

function hasAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Cross-domain redirect preservando path + query. Cookie sigue siendo válida
 * porque está en `.fyzon.es`. Status 307 para preservar método.
 */
function crossDomainRedirect(toHost: 'admin' | 'panel', path: string, search: string): NextResponse {
  const target = toHost === 'admin' ? `https://${ADMIN_HOST}` : `https://${PANEL_HOST}`;
  return NextResponse.redirect(`${target}${path}${search}`, 307);
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const hostname = request.nextUrl.hostname;
  const hostMode = classifyHost(hostname);
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  // -------------------------------------------------------------------------
  // FASE 1 — Hostname routing (antes de tocar Supabase)
  //
  // admin.fyzon.es solo sirve rutas admin/auth-públicas. Rutas trainer
  // redirigen a panel.fyzon.es. Y viceversa.
  // -------------------------------------------------------------------------
  if (hostMode === 'admin') {
    // En admin.fyzon.es, `/` → /admin/login (o /admin/dashboard si auth — lo manejamos abajo).
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/admin/login', request.nextUrl.origin), 307);
    }
    // /login en admin domain → /admin/login (normaliza).
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/admin/login', request.nextUrl.origin), 307);
    }
    // Rutas trainer (dashboard, conversations, etc) NO existen en admin domain.
    // Las redirigimos cross-domain a panel.fyzon.es preservando path/query.
    if (hasAnyPrefix(pathname, TRAINER_PREFIXES)) {
      return crossDomainRedirect('panel', pathname, search);
    }
    // /signup en admin no tiene sentido — al login admin.
    if (pathname === '/signup') {
      return NextResponse.redirect(new URL('/admin/login', request.nextUrl.origin), 307);
    }
  } else if (hostMode === 'panel') {
    // En panel.fyzon.es, rutas admin NO existen. Cross-domain a admin.fyzon.es.
    if (hasAnyPrefix(pathname, ADMIN_PREFIXES)) {
      return crossDomainRedirect('admin', pathname, search);
    }
  }
  // En 'dev' (localhost) no aplicamos restricciones cross-domain.

  // -------------------------------------------------------------------------
  // FASE 2 — Supabase auth + cookie domain
  // -------------------------------------------------------------------------
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          const enriched: CookieOptions = {
            ...options,
            // En producción (subdomains fyzon.es) compartimos cookie entre admin/panel.
            // En dev (localhost) dejamos default (sin domain).
            ...(hostMode !== 'dev' ? { domain: COOKIE_DOMAIN } : {}),
          };
          supabaseResponse.cookies.set(name, value, enriched);
        });
      },
    },
  });

  // getUser() dispara el refresh de la cookie cuando hace falta.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAlwaysPublic = ALWAYS_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname === p);
  const isAdminLogin = pathname === '/admin/login';
  const isProtected =
    !isAuthOnly &&
    !isAlwaysPublic &&
    !isAdminLogin &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAdminRoute = !isAdminLogin && pathname.startsWith('/admin');

  if (isProtected && !user) {
    // Redirect a login del shell correspondiente.
    const loginPath = hostMode === 'admin' || isAdminRoute ? '/admin/login' : '/login';
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = loginPath;
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Role guard: /admin/* SOLO para is_agency_admin=true.
  if (isProtected && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_agency_admin, is_active, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('error', 'inactive');
      await supabase.auth.signOut();
      return NextResponse.redirect(redirectUrl);
    }

    if (isAdminRoute && profile?.is_agency_admin !== true) {
      // Si llega aquí sin ser admin — al dashboard trainer de su domain.
      if (hostMode === 'admin') {
        return crossDomainRedirect('panel', '/dashboard', '');
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    const isOwnerOnly = OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    if (
      isOwnerOnly &&
      profile?.is_agency_admin !== true &&
      profile?.role !== 'owner'
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('error', 'owner_only');
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isAuthOnly && user) {
    // Post-login redirect: agency admin → /admin/dashboard (en admin.fyzon.es),
    // trainer → /dashboard (en panel.fyzon.es).
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_agency_admin')
      .eq('id', user.id)
      .maybeSingle();
    const isAgencyAdmin = profile?.is_agency_admin === true;

    if (hostMode === 'panel' && isAgencyAdmin) {
      return crossDomainRedirect('admin', '/admin/dashboard', '');
    }
    if (hostMode === 'admin' && !isAgencyAdmin) {
      return crossDomainRedirect('panel', '/dashboard', '');
    }
    // Mismo dominio — redirect interno.
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isAgencyAdmin ? '/admin/dashboard' : '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
