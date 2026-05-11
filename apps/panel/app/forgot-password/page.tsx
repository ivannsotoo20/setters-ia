import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Te enviamos un enlace por email para definir una nueva."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
