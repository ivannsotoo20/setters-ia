import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm';

interface AdminLoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = await searchParams;
  const next = params.next ?? '/admin/dashboard';

  return (
    <AuthShell
      variant="admin"
      badge="Acceso interno Fyzon"
      title="Login admin"
      subtitle="Acceso restringido a admins de Fyzon Setters."
    >
      <PasswordLoginForm next={next} hideInviteHint />
    </AuthShell>
  );
}
