/**
 * DEV-ONLY login bypass.
 *
 * Solo activo si `NODE_ENV !== 'production'`. En producción devuelve 404.
 *
 * Flujo:
 *   1. Service-role genera magic link `auth.admin.generateLink` para el email solicitado.
 *   2. Se extrae el `hashed_token` del resultado.
 *   3. El cliente SSR de Supabase (cookies del browser) llama `verifyOtp({token_hash, type:'magiclink'})`.
 *      Eso valida el token y SETEA las cookies de sesión `sb-...-auth-token` automáticamente.
 *   4. Redirige a `?next=` o `/admin/tenants`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get('email') ?? 'sotobautistaivan@gmail.com';
  const next = url.searchParams.get('next') ?? '/admin/tenants';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'missing_env', detail: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' },
      { status: 500 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: 'generate_link_failed', detail: linkErr?.message ?? 'no hashed_token' },
      { status: 500 },
    );
  }

  const ssr = await createSupabaseServerClient();
  const { error: otpErr } = await ssr.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr) {
    return NextResponse.json(
      { error: 'verify_otp_failed', detail: otpErr.message },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
