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

  // next puede ser /dashboard, /onboarding, /dashboard/conversations/123, etc.
  // Validamos que sea una ruta interna (no open redirect).
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
