'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server actions de autenticacion para el panel SaaS.
 *
 * Modelo: magic link (signInWithOtp). El usuario introduce su email,
 * Supabase envia el enlace, el usuario hace click y aterriza en
 * /auth/callback?code=XYZ, donde intercambiamos el codigo por sesion.
 *
 * No usamos passwords. Si en el futuro entra Google OAuth, se anade aqui.
 *
 * Para signup, el flujo es identico al login (Supabase crea el auth.users
 * si no existe). La diferencia: en signup mandamos el `next` al wizard
 * de onboarding; en login, al dashboard.
 */

interface AuthState {
  status: 'idle' | 'sent' | 'error';
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_PANEL_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  );
}

async function getOriginFromHeaders(): Promise<string> {
  // En produccion el origin lo da el reverse proxy. Lo cogemos del header
  // si esta disponible y caemos a la env si no.
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${proto}://${host}`;
  } catch {
    // headers() solo funciona en server contexts. Si falla, fallback.
  }
  return getOrigin();
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/dashboard');
  const intent = String(formData.get('intent') ?? 'login');

  if (!EMAIL_REGEX.test(email)) {
    return { status: 'error', message: 'Email invalido. Revisa el formato.' };
  }

  const supabase = await createSupabaseServerClient();
  const origin = await getOriginFromHeaders();

  // En signup permitimos crear el auth.users si no existe.
  // En login forzamos shouldCreateUser=false para no crear cuentas accidentalmente.
  const shouldCreateUser = intent === 'signup';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser,
    },
  });

  if (error) {
    // shouldCreateUser=false con email no registrado devuelve error explicito.
    if (error.status === 422 || error.message.toLowerCase().includes('not found')) {
      return {
        status: 'error',
        message:
          'No hay cuenta con ese email. Si eres nuevo en Fyzon, ve al registro.',
      };
    }
    return { status: 'error', message: `No pudimos enviar el enlace: ${error.message}` };
  }

  return {
    status: 'sent',
    message: `Te enviamos un enlace a ${email}. Revisa tu bandeja (y spam).`,
  };
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
