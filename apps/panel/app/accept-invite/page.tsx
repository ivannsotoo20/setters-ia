import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Página /accept-invite?token=xxx — destino del email "activa tu cuenta".
 *
 *  - Si el token es inválido, expirado, ya usado o revocado: mostramos error.
 *  - Si el token es válido: mostramos form con preview del invite (email + role + tenant).
 *    El usuario define password + full name → acceptInviteAction crea cuenta y redirige.
 */
export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams;
  const token = (params.token ?? '').trim();

  if (!token) {
    return (
      <AuthShell title="Invitación faltante" subtitle="El enlace no incluye token.">
        <p className="auth-message auth-message--error">
          El enlace de invitación está incompleto. Pídele a tu admin de Fyzon que reenvíe la
          invitación.
        </p>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link href="/login" style={{ color: 'var(--color-accent)' }}>
            Volver a /login
          </Link>
        </p>
      </AuthShell>
    );
  }

  const admin = getServiceRoleClient();
  const { data: invite } = await admin
    .from('pending_invites')
    .select(
      'id, email, tenant_id, role, is_agency_admin, full_name_hint, token_expires_at, accepted_at, revoked_at',
    )
    .eq('token', token)
    .maybeSingle();

  let problem: string | null = null;
  if (!invite) problem = 'Invitación no encontrada. El token no es válido.';
  else if (invite.accepted_at) problem = 'Esta invitación ya fue aceptada.';
  else if (invite.revoked_at) problem = 'Esta invitación fue cancelada por un admin.';
  else if (new Date(invite.token_expires_at) < new Date())
    problem = 'Esta invitación ha caducado. Pide una nueva a tu admin.';

  if (problem || !invite) {
    return (
      <AuthShell title="Invitación inválida" subtitle="">
        <p className="auth-message auth-message--error">{problem}</p>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link href="/login" style={{ color: 'var(--color-accent)' }}>
            Ir a /login
          </Link>
        </p>
      </AuthShell>
    );
  }

  // Resolve tenant name for preview.
  let contextLabel = 'Fyzon Setters Agency';
  if (!invite.is_agency_admin && invite.tenant_id != null) {
    const { data: tenant } = await admin
      .from('tenants')
      .select('name')
      .eq('id', invite.tenant_id)
      .maybeSingle();
    contextLabel = tenant?.name ?? `Tenant #${invite.tenant_id}`;
  }

  const roleLabel = invite.is_agency_admin
    ? 'Admin Fyzon'
    : invite.role === 'owner'
      ? 'Owner del tenant'
      : invite.role === 'admin'
        ? 'Colaborador'
        : 'Viewer';

  return (
    <AuthShell
      variant={invite.is_agency_admin ? 'admin' : 'default'}
      badge={invite.is_agency_admin ? 'Activación admin Fyzon' : 'Activa tu cuenta'}
      title="Bienvenido a Fyzon Setters"
      subtitle="Define tu contraseña para entrar al panel."
    >
      <AcceptInviteForm
        token={token}
        email={invite.email}
        fullNameHint={invite.full_name_hint ?? ''}
        roleLabel={roleLabel}
        contextLabel={contextLabel}
      />
    </AuthShell>
  );
}
