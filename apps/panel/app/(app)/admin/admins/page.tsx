import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminsAction, listAdminPendingInvitesAction } from '@/lib/actions/admins';
import { InviteAdminDialog } from '@/components/admin/InviteAdminDialog';
import { AdminRowActions, PendingInviteRowActions } from '@/components/admin/AdminRowActions';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

/**
 * /admin/admins — gestión de agency admins.
 *
 * Visible solo para agency admins activos. Muestra:
 *  1. Tabla de admins existentes (email, nombre, estado) con acciones revoke/reactivate.
 *  2. Tabla de invites pendientes (email, sugerencia nombre, expiración) con resend/revoke.
 *  3. Botón "Invitar admin" → InviteAdminDialog.
 */
export default async function AdminsPage() {
  // Gate
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  const callerId = profile.id;

  const [adminsRes, invitesRes] = await Promise.all([
    listAdminsAction(),
    listAdminPendingInvitesAction(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Vista agencia · Fyzon
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Admins Fyzon</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona los administradores internos de Fyzon Setters. Solo otros admins pueden
            invitar o desactivar admins.
          </p>
        </div>
        <InviteAdminDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admins existentes</CardTitle>
          <CardDescription>
            Cuentas activas e inactivas con acceso a /admin/*. No puedes desactivarte a ti mismo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!adminsRes.ok ? (
            <p className="text-sm text-destructive">Error: {adminsRes.error}</p>
          ) : (adminsRes.admins?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sin admins. Invita el primero.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Alta</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminsRes.admins!.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.email}</TableCell>
                    <TableCell>{a.full_name ?? '—'}</TableCell>
                    <TableCell>
                      {a.is_active ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString('es-ES')}
                    </TableCell>
                    <TableCell className="text-right">
                      <AdminRowActions
                        profileId={a.id}
                        email={a.email}
                        isActive={a.is_active}
                        isSelf={a.id === callerId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          <CardDescription>
            Tokens activos no aceptados aún. Expiran 7 días tras envío.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!invitesRes.ok ? (
            <p className="text-sm text-destructive">Error: {invitesRes.error}</p>
          ) : (invitesRes.invites?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre sugerido</TableHead>
                  <TableHead>Invitado por</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitesRes.invites!.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                    <TableCell>{inv.full_name_hint ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.invited_by_email ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inv.is_expired ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          Caducado
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {new Date(inv.token_expires_at).toLocaleDateString('es-ES')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <PendingInviteRowActions
                        inviteId={inv.id}
                        email={inv.email}
                        isExpired={inv.is_expired}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
