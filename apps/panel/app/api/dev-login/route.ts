/**
 * DEV-ONLY login bypass.
 *
 * Hardening 2026-05-15 (audit security CRITICAL C-4):
 *   - Gating dual: NODE_ENV='development' AND no-Vercel AND no-Railway AND host=localhost.
 *   - Flag explícito ENABLE_DEV_LOGIN debe estar a '1' en .env.local.
 *   - Whitelist de emails permitidos (no signups arbitrarios via service_role).
 *   - Solo HTTP method GET.
 *
 * Flujo (sin cambios):
 *   1. Service-role genera magic link `auth.admin.generateLink` para el email solicitado.
 *   2. Se extrae el `hashed_token` del resultado.
 *   3. El cliente SSR de Supabase (cookies del browser) llama `verifyOtp({token_hash, type:'magiclink'})`.
 *      Eso valida el token y SETEA las cookies de sesión `sb-...-auth-token` automáticamente.
 *   4. Redirige a `?next=` o `/admin/tenants`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Lista exhaustiva de emails con permiso de login bypass en dev local.
// Ampliar SOLO añadiendo aquí (no leer de env: las env vars son fáciles de
// inyectar accidentalmente en CI/preview).
const ALLOWED_DEV_EMAILS = new Set<string>([
  'sotobautistaivan@gmail.com',
]);

const LOCALHOST_HOST_REGEX = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/i;

function isLocalDevRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (process.env.RAILWAY_ENVIRONMENT) return false;
  if (process.env.ENABLE_DEV_LOGIN !== '1') return false;
  const host = request.headers.get('host') ?? '';
  return LOCALHOST_HOST_REGEX.test(host);
}

export async function GET(request: NextRequest) {
  if (!isLocalDevRequest(request)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get('email') ?? 'sotobautistaivan@gmail.com';
  const next = url.searchParams.get('next') ?? '/admin/tenants';

  if (!ALLOWED_DEV_EMAILS.has(email.toLowerCase())) {
    return NextResponse.json(
      { error: 'email_not_allowed', detail: 'Email not in dev whitelist. Edit ALLOWED_DEV_EMAILS in route.ts to add.' },
      { status: 403 },
    );
  }

  // Validación adicional next: solo paths relativos (no abre redirect open).
  if (!next.startsWith('/') || next.startsWith('//')) {
    return NextResponse.json({ error: 'invalid_next', detail: 'next must be a relative path' }, { status: 400 });
  }

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
