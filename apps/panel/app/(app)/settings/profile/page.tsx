import { redirect } from 'next/navigation';
import { getOwnProfile } from '@/lib/actions/profile';
import { ProfileForm } from '@/components/settings/ProfileForm';

export const dynamic = 'force-dynamic';

/**
 * /settings/profile — gestión del perfil propio del usuario (Hito 11.2.C).
 *
 * Equivalente a "My Profile" de GHL: edita full_name + phone + bio + avatar.
 * Email es read-only (gestionado por Supabase Auth con su propio flow).
 * Para cambiar role / tenant / is_agency_admin → acción de admin desde /admin/*.
 */
export default async function ProfilePage() {
  const result = await getOwnProfile();
  if (!result.ok) {
    if (result.error === 'unauthenticated') {
      redirect('/login');
    }
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-destructive">Error cargando perfil: {result.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Configuración
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edita tu información personal y tu foto. Los cambios se ven en el resto del panel.
        </p>
      </div>
      <ProfileForm initial={result.profile} />
    </div>
  );
}
