'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Server actions de autenticación para el panel SaaS Fyzon Setters.
 *
 * Modelo (Hito 10): invitation-only + email/password.
 *
 *  - Signup público desactivado: cualquier alta requiere un invite (token con expiración 7d)
 *    creado por agency admin o tenant owner desde el panel.
 *  - Login: email + password (`signInWithPassword`).
 *  - Recuperación: `requestPasswordReset` envía email Supabase con redirectTo `/reset-password`.
 *  - Cambio de password con sesión activa: `updatePasswordAction`.
 *
 * Las server actions que crean cuentas y aceptan invites viven en `./invites.ts` y
 * usan service_role para crear el row en `auth.users` + `profiles`.
 *
 * El helper de magic link (`sendMagicLink`) queda como dead-code reversible por si
 * se necesita rollback rápido, pero la UI no debe invocarlo en Hito 10+.
 */

export interface AuthActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

function getEnvOrigin(): string {
  return (
    process.env.PANEL_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_PANEL_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  );
}

async function getOriginFromHeaders(): Promise<string> {
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${proto}://${host}`;
  } catch {
    // headers() solo en server. Fallback env.
  }
  return getEnvOrigin();
}

/**
 * Valida que un email tenga formato razonable + lo normaliza (lowercase + trim).
 * Devuelve null si es inválido.
 */
function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) return null;
  return email;
}

/**
 * Server action — login con email + password.
 *
 * Flujo:
 *  1. Valida formato email + longitud password.
 *  2. signInWithPassword (vía cliente SSR del usuario).
 *  3. Si OK, verifica `profiles.is_active` (rechazo si false con signOut + error).
 *  4. Redirect a `next` (safe) o `/dashboard`. Smart redirect a `/admin/dashboard`
 *     si `is_agency_admin=true` (el middleware también lo haría, pero acortamos hop).
 */
export async function signInWithPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const nextRaw = String(formData.get('next') ?? '');
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

  if (!email) {
    return { status: 'error', message: 'Email inválido. Revisa el formato.' };
  }
  if (!password || password.length < 1) {
    return { status: 'error', message: 'Introduce tu contraseña.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // No leak: mismo mensaje para usuario no existe vs password mala.
    return {
      status: 'error',
      message: 'Email o contraseña incorrectos. Si has olvidado tu contraseña, recupérala desde el enlace.',
    };
  }

  // Verificar is_active. Si profile no existe (rare), tratar como inactivo.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, is_agency_admin')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) {
    await supabase.auth.signOut();
    return {
      status: 'error',
      message: 'Tu cuenta está desactivada. Contacta con un admin de Fyzon.',
    };
  }

  // Redirect en server action — usa next/navigation redirect() que tira la excepción.
  if (next) {
    redirect(next);
  }
  redirect(profile.is_agency_admin === true ? '/admin/dashboard' : '/dashboard');
}

/**
 * Server action — solicitar reset password.
 *
 * Política: NUNCA confirmar si el email existe o no (anti-enumeración).
 * Devolvemos siempre `success` con mensaje genérico.
 */
export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get('email'));
  if (!email) {
    return { status: 'error', message: 'Email inválido. Revisa el formato.' };
  }

  const supabase = await createSupabaseServerClient();
  const origin = await getOriginFromHeaders();

  // Pasamos por /auth/callback para intercambiar el code por sesión recovery,
  // luego el callback redirige a /reset-password con sesión activa.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  });

  // Audit log via service_role (best effort — no bloquear UX si falla).
  try {
    const admin = getServiceRoleClient();
    const { data: user } = await admin
      .from('profiles')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle();
    if (user) {
      await admin.from('tenant_audit_log').insert({
        tenant_id: user.tenant_id,
        actor_user_id: user.id,
        actor_email: email,
        action: 'password.reset_requested',
        target_user_id: user.id,
        target_email: email,
      });
    }
  } catch {
    // swallow — no leak
  }

  return {
    status: 'success',
    message:
      'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Revisa tu bandeja (y spam).',
  };
}

/**
 * Server action — actualizar password con sesión activa.
 *
 * Usado en `/reset-password` (post-click del link) y futuro `/settings/security`.
 * Requiere que el usuario esté autenticado (Supabase verifica con la sesión cookie).
 */
export async function updatePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '');
  const passwordConfirm = String(formData.get('password_confirm') ?? '');

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'error',
      message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (password !== passwordConfirm) {
    return { status: 'error', message: 'Las contraseñas no coinciden.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: 'error',
      message: 'Sesión expirada. Vuelve a solicitar el enlace de recuperación.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: 'error', message: `No pudimos actualizar la contraseña: ${error.message}` };
  }

  // Audit log best effort.
  try {
    const admin = getServiceRoleClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id, email')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) {
      await admin.from('tenant_audit_log').insert({
        tenant_id: profile.tenant_id,
        actor_user_id: user.id,
        actor_email: profile.email,
        action: 'password.changed',
        target_user_id: user.id,
        target_email: profile.email,
      });
    }
  } catch {
    // swallow
  }

  return { status: 'success', message: 'Contraseña actualizada. Te redirigimos…' };
}

/**
 * Server action — logout.
 */
export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// Magic link helper eliminado en Auth.5 cleanup. El modelo invitation-only +
// password lo reemplaza por completo. Si en el futuro hace falta magic link
// (p.ej. para passwordless en SSO), restaurar `signInWithOtp` aquí y crear UI.
