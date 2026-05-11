import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Página /reset-password — destino del email "recupera contraseña".
 *
 * Supabase setea una sesión TEMPORAL (de tipo recovery) cuando el user pulsa
 * el link del email. Si no hay sesión activa, la action `updatePasswordAction`
 * fallará. Mostramos error claro si llegan sin sesión.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión recovery → invitamos a iniciar el flow de nuevo.
  if (!user) {
    redirect('/forgot-password?error=missing_session');
  }

  return (
    <AuthShell
      title="Definir nueva contraseña"
      subtitle="Elige una contraseña nueva para tu cuenta."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
