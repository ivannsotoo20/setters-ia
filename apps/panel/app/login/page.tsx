import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm';

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params.next ?? '';

  let banner: string | null = null;
  if (params.error === 'inactive') {
    banner = 'Tu cuenta está desactivada. Contacta con un admin de Fyzon.';
  } else if (params.error === 'owner_only') {
    banner = 'Esa zona es solo para owners del tenant.';
  } else if (params.error === 'missing_code' || params.error === 'invalid_code') {
    banner = 'El enlace ha expirado o no es válido. Pide uno nuevo.';
  } else if (params.error === 'signup_disabled') {
    banner = 'El registro es solo por invitación. Si tienes un link de invitación, ábrelo desde el email.';
  }

  return (
    <AuthShell
      title="Entrar a Fyzon Setters"
      subtitle="Accede a tu panel con tu email y contraseña."
    >
      {banner && (
        <p className="auth-message auth-message--error" role="alert">
          {banner}
        </p>
      )}
      <PasswordLoginForm next={next} />
    </AuthShell>
  );
}
