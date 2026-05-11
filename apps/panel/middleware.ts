import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Refresca la cookie de sesion Supabase en cada request y protege las rutas
 * marcadas como autenticadas (todo lo que cuelgue de PROTECTED_PREFIXES).
 *
 * Este middleware es REQUERIDO por @supabase/ssr para que Server Components
 * y Server Actions tengan acceso al usuario actualizado en cada request.
 *
 * NO leer datos sensibles aqui (es codigo del Edge runtime). Solo gating.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/conversations', '/settings', '/keywords', '/admin'];
/** Rutas que SOLO se muestran cuando NO hay sesión (login/signup-like). */
const AUTH_ONLY_PATHS = ['/login', '/admin/login', '/forgot-password'];
/** Rutas siempre accesibles sin auth (token-based o post-click email). */
const ALWAYS_PUBLIC_PATHS = ['/accept-invite', '/reset-password'];
/** Rutas accesibles SOLO para owner del tenant o agency admin. */
const OWNER_ONLY_PREFIXES = ['/settings/integrations', '/settings/preferences'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail-open: si faltan vars, dejar pasar para no romper /login y poder
    // mostrar un error util en el server component. El error real lo dispara
    // createSupabaseServerClient cuando se intente usar.
    return supabaseResponse;
  }

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
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() es lo que dispara el refresh de la cookie cuando hace falta.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAlwaysPublic = ALWAYS_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname === p);
  // /admin/login NO debe contar como ruta protegida — entra en isAuthOnly antes que en isProtected.
  const isAdminLogin = pathname === '/admin/login';
  const isProtected = !isAuthOnly && !isAlwaysPublic && !isAdminLogin
    && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAdminRoute = !isAdminLogin && pathname.startsWith('/admin');

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Role guard: /admin/* SOLO para is_agency_admin=true. Los profiles
  // con is_active=false se rechazan en cualquier ruta protegida.
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
      // borra cookie de sesión
      await supabase.auth.signOut();
      return NextResponse.redirect(redirectUrl);
    }

    if (isAdminRoute && profile?.is_agency_admin !== true) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    // Bloqueo rutas owner-only para collaborators que intenten acceso por URL.
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
    // Post-login redirect: agency admin → /admin/dashboard, resto → /dashboard.
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_agency_admin')
      .eq('id', user.id)
      .maybeSingle();

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = profile?.is_agency_admin === true ? '/admin/dashboard' : '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match todo excepto:
     * - api routes
     * - _next/static, _next/image
     * - favicon.ico
     * - archivos estaticos de imagen
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
