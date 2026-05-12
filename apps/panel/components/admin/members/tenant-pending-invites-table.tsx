import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PendingInviteRowActions } from '@/components/admin/AdminRowActions';
import {
  listTenantPendingInvites,
  type TenantPendingInvite,
} from '@/lib/actions/members';

/**
 * Server Component que muestra los invites pendientes (no aceptados, no revocados)
 * de un tenant. Se renderiza arriba de la lista de miembros activos en
 * `/admin/tenants/[id]/members`. Reusa `PendingInviteRowActions` (botones
 * Reenviar / Cancelar) ya existente en `AdminRowActions`.
 */
export async function TenantPendingInvitesTable({ tenantId }: { tenantId: number }) {
  const result = await listTenantPendingInvites({ tenantId });
  if (!result.ok) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-destructive">Error: {result.error}</p>
        </CardContent>
      </Card>
    );
  }
  const invites = result.data ?? [];
  if (invites.length === 0) {
    // No render si no hay invites pendientes — evita clutter visual.
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Invitaciones pendientes ({invites.length})
        </CardTitle>
        <CardDescription>
          Usuarios invitados que aún no han activado su cuenta. Mantén la
          invitación viva con &quot;Reenviar&quot; o cancélala si fue por error.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-6">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead>Nombre sugerido</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Invitado por</TableHead>
                <TableHead>Caduca</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((inv) => (
                <PendingInviteRow key={inv.id} invite={inv} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingInviteRow({ invite }: { invite: TenantPendingInvite }) {
  const expiresLabel = formatLabel(invite.tokenExpiresAt);
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{invite.email}</TableCell>
      <TableCell className="text-sm">
        {invite.fullNameHint ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {invite.role}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {invite.invitedByEmail ?? '—'}
      </TableCell>
      <TableCell className="text-xs">
        {invite.isExpired ? (
          <span className="text-destructive">caducado · {expiresLabel}</span>
        ) : (
          <span className="text-muted-foreground">{expiresLabel}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <PendingInviteRowActions
          inviteId={invite.id}
          email={invite.email}
          isExpired={invite.isExpired}
        />
      </TableCell>
    </TableRow>
  );
}

function formatLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Madrid',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
