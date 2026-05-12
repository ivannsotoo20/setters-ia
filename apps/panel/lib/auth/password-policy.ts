/**
 * Política de contraseñas mínima (NIST 2024-style: longitud + blacklist, sin
 * forzar complejidad mixta que empeora la entropía real).
 *
 * Reusable en signup, reset-password y accept-invite.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** Top de passwords débiles que cumplen length≥10 pero son triviales. */
const COMMON_PASSWORDS = new Set<string>([
  '1234567890',
  '12345678901',
  '123456789012',
  '0123456789',
  'password123',
  'password1234',
  'qwertyuiop',
  '1q2w3e4r5t',
  'qwerty12345',
  'fyzon12345',
  'fyzon2026',
  'admin12345',
  'admin1234567',
  'changeme123',
  'welcome123',
  'iloveyou1',
  '1q2w3e4r5t6y',
  '1qaz2wsx3edc',
  'abc123abc123',
]);

export type PasswordPolicyError =
  | { code: 'too_short'; min: number }
  | { code: 'too_long'; max: number }
  | { code: 'contains_email'; }
  | { code: 'only_digits' }
  | { code: 'common' }
  | { code: 'mismatch' };

export function validatePassword(
  password: string,
  options?: { email?: string | null; passwordConfirm?: string | null },
): { ok: true } | { ok: false; error: PasswordPolicyError } {
  if (typeof password !== 'string') {
    return { ok: false, error: { code: 'too_short', min: MIN_PASSWORD_LENGTH } };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: { code: 'too_short', min: MIN_PASSWORD_LENGTH } };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: { code: 'too_long', max: MAX_PASSWORD_LENGTH } };
  }
  if (/^\d+$/.test(password)) {
    return { ok: false, error: { code: 'only_digits' } };
  }
  if (options?.email) {
    const local = options.email.split('@')[0]?.trim().toLowerCase();
    if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
      return { ok: false, error: { code: 'contains_email' } };
    }
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: { code: 'common' } };
  }
  if (options?.passwordConfirm != null && password !== options.passwordConfirm) {
    return { ok: false, error: { code: 'mismatch' } };
  }
  return { ok: true };
}

/** Convierte un PasswordPolicyError a mensaje localizado (es-ES). */
export function passwordErrorMessage(err: PasswordPolicyError): string {
  switch (err.code) {
    case 'too_short':
      return `La contraseña debe tener al menos ${err.min} caracteres.`;
    case 'too_long':
      return `La contraseña no puede superar ${err.max} caracteres.`;
    case 'contains_email':
      return 'La contraseña no puede contener tu email.';
    case 'only_digits':
      return 'La contraseña no puede ser solo números.';
    case 'common':
      return 'Esa contraseña es demasiado común. Elige una más fuerte.';
    case 'mismatch':
      return 'Las contraseñas no coinciden.';
  }
}
