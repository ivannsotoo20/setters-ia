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
const AUTH_ONLY_PATHS = ['/login', '/signup'];

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
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname === p);

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthOnly && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
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
