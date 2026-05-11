import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Endpoint de callback de Supabase Auth (magic link / OAuth).
 *
 * Supabase redirige al usuario aqui tras el click en el email con:
 *   /auth/callback?code=XYZ&next=/dashboard
 *
 * Intercambiamos el `code` por una sesion via cookies y redirigimos
 * a `next` (o a /dashboard si no viene). Si falla, redirigimos a
 * /login con un mensaje de error en query.
 */

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';
  const type = url.searchParams.get('type'); // 'recovery' para reset password

  if (!code) {
    const errUrl = new URL('/login', url.origin);
    errUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(errUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errUrl = new URL('/login', url.origin);
    errUrl.searchParams.set('error', 'invalid_code');
    return NextResponse.redirect(errUrl);
  }

  // Recovery (reset password) — Supabase setea una sesión temporal y queremos
  // que el user aterrice en /reset-password para definir nueva contraseña.
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', url.origin));
  }

  // next puede ser /dashboard, /onboarding, /dashboard/conversations/123, etc.
  // Validamos que sea una ruta interna (no open redirect).
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  // Si el `next` es el default `/dashboard` (no había explícito), redirigir
  // según el rol del profile. Agency admin → /admin/dashboard. Colaborador
  // sin tenant → /dashboard (donde se le mostrará un mensaje si no hay
  // permisos en alguna sub-ruta).
  if (safeNext === '/dashboard') {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_agency_admin, is_active')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.is_active === false) {
        const errUrl = new URL('/login', url.origin);
        errUrl.searchParams.set('error', 'inactive');
        return NextResponse.redirect(errUrl);
      }
      if (profile?.is_agency_admin === true) {
        return NextResponse.redirect(new URL('/admin/dashboard', url.origin));
      }
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
