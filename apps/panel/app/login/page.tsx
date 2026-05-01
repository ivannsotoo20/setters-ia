import Link from 'next/link';
import { LoginForm } from './login-form';

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params.next ?? '/dashboard';

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Entrar a Fyzon Setters</h1>
        <p className="auth-subtitle">
          Te enviamos un enlace magico al email. Sin contrasenas.
        </p>

        <LoginForm next={next} intent="login" />

        <p className="auth-footer">
          Aun no tienes cuenta? <Link href="/signup">Registrate</Link>
        </p>
      </div>
    </main>
  );
}
