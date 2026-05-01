import Link from 'next/link';
import { LoginForm } from '../login/login-form';

interface SignupPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  // Tras crear cuenta, en futuras sesiones aterriza en el wizard de onboarding.
  // Hoy todavia no existe → /dashboard. Cuando exista /onboarding, cambiar default aqui.
  const next = params.next ?? '/dashboard';

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Crear cuenta en Fyzon Setters</h1>
        <p className="auth-subtitle">
          Te enviamos un enlace magico al email para confirmar.
        </p>

        <LoginForm next={next} intent="signup" />

        <p className="auth-footer">
          Ya tienes cuenta? <Link href="/login">Entra</Link>
        </p>
      </div>
    </main>
  );
}
