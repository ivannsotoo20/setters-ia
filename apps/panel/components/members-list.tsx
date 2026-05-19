'use client';

import { useState, useTransition } from 'react';
import {
  UserPlus,
  KeyRound,
  Trash2,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  inviteMember,
  resetMemberPassword,
  changeMemberRole,
  removeMember,
  type MemberRow,
  type TenantPendingInvite,
} from '@/lib/actions/members';
import { revokeInviteAction, resendInviteEmailAction } from '@/lib/actions/invites';
import { MailWarning, RotateCw, X } from 'lucide-react';

type UiRole = 'owner' | 'admin';

const UI_ROLE_LABELS: Record<UiRole, string> = {
  owner: 'Owner',
  admin: 'Colaborador',
};

const UI_ROLE_DESCRIPTIONS: Record<UiRole, string> = {
  owner: 'Acceso total: prompts, integraciones, miembros, todo.',
  admin: 'Conversaciones + pausar IA. NO toca prompts/integraciones/miembros.',
};

interface Props {
  tenantId: number;
  initialMembers: MemberRow[];
  /** Invitaciones que aún no han sido aceptadas (pending_invites). Sprint Iota.5 hotfix. */
  initialInvites?: TenantPendingInvite[];
  /** Si false, oculta los botones de acción (vista read-only para viewers). */
  canManage: boolean;
  /** ID del propio usuario, para evitar quitarse a sí mismo. */
  currentUserId: string;
}

export function MembersList({
  tenantId,
  initialMembers,
  initialInvites = [],
  canManage,
  currentUserId,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteOpen, setInviteOpen] = useState(false);

  const refreshMember = (userId: string, patch: Partial<MemberRow>) => {
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, ...patch } : m)),
    );
  };

  const removeFromList = (userId: string) => {
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  const removeInviteFromList = (inviteId: number) => {
    setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
  };

  const addInviteToList = (newInvite: TenantPendingInvite) => {
    setInvites((prev) => [newInvite, ...prev.filter((inv) => inv.id !== newInvite.id)]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Miembros</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personas con acceso al panel de esta sub-cuenta.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" />
            Invitar miembro
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    Sin miembros aún.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <MemberRowUi
                    key={m.userId}
                    tenantId={tenantId}
                    member={m}
                    canManage={canManage}
                    isSelf={m.userId === currentUserId}
                    onRoleChange={(newRole) =>
                      refreshMember(m.userId, { role: newRole })
                    }
                    onRemove={() => removeFromList(m.userId)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invitaciones pendientes — Sprint Iota.5 hotfix */}
      {invites.length > 0 ? (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Invitaciones pendientes</h3>
            <Badge variant="secondary" className="h-5 text-[10px]">
              {invites.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Email enviado, pero el invitado aún no aceptó la invitación. El enlace
            caduca tras 7 días. Puedes reenviar el email o revocar el invite.
          </p>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead>Caduca</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <PendingInviteRowUi
                      key={inv.id}
                      invite={inv}
                      canManage={canManage}
                      onRevoked={() => removeInviteFromList(inv.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canManage ? (
        <InviteMemberDialog
          tenantId={tenantId}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onSuccess={(payload) => {
            if (payload.kind === 'member') {
              setMembers((prev) => {
                const exists = prev.find((m) => m.userId === payload.member.userId);
                if (exists) {
                  return prev.map((m) =>
                    m.userId === payload.member.userId ? { ...m, ...payload.member } : m,
                  );
                }
                return [...prev, payload.member];
              });
            } else {
              addInviteToList(payload.invite);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function PendingInviteRowUi({
  invite,
  canManage,
  onRevoked,
}: {
  invite: TenantPendingInvite;
  canManage: boolean;
  onRevoked: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const handleResend = () => {
    startTransition(async () => {
      const result = await resendInviteEmailAction(invite.id);
      if (result.ok) {
        toast.success(`Email reenviado a ${invite.email}.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInviteAction(invite.id);
      if (result.ok) {
        onRevoked();
        toast.success(`Invitación a ${invite.email} revocada.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span>{invite.email}</span>
          {invite.fullNameHint ? (
            <span className="text-xs text-muted-foreground">{invite.fullNameHint}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {UI_ROLE_LABELS[invite.role as UiRole] ?? invite.role}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {new Date(invite.invitedAt).toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </TableCell>
      <TableCell>
        {invite.isExpired ? (
          <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/5">
            <MailWarning className="size-3 mr-1" />
            Caducada
          </Badge>
        ) : (
          <Badge variant="outline" className="text-warning border-warning/40 bg-warning/5">
            <Clock className="size-3 mr-1" />
            Pendiente
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canManage ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResend}
              disabled={pending}
              title="Reenviar email de invitación"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCw className="size-3.5" />
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  title="Revocar invitación"
                >
                  <X className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revocar invitación a {invite.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El enlace que enviamos por email dejará de funcionar. Si el
                    invitado intenta usarlo verá un error. Puedes invitarlo de
                    nuevo después.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevoke}>
                    Revocar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function MemberRowUi({
  tenantId,
  member,
  canManage,
  isSelf,
  onRoleChange,
  onRemove,
}: {
  tenantId: number;
  member: MemberRow;
  canManage: boolean;
  isSelf: boolean;
  onRoleChange: (newRole: 'owner' | 'admin') => void;
  onRemove: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const handleRoleChange = (newRole: string) => {
    if (newRole !== 'owner' && newRole !== 'admin') return;
    startTransition(async () => {
      const result = await changeMemberRole({
        tenantId,
        userId: member.userId,
        newRole,
      });
      if (result.ok) {
        onRoleChange(newRole);
        toast.success(`Rol actualizado a ${UI_ROLE_LABELS[newRole]}.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleResetPassword = () => {
    startTransition(async () => {
      const result = await resetMemberPassword({ tenantId, userId: member.userId });
      if (result.ok) {
        toast.success(`Email de restablecimiento enviado a ${member.email}.`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeMember({ tenantId, userId: member.userId });
      if (result.ok) {
        onRemove();
        toast.success('Miembro quitado.');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span>{member.email}</span>
          {member.fullName ? (
            <span className="text-xs text-muted-foreground">{member.fullName}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {member.isAgencyAdmin ? (
          <Badge
            variant="outline"
            className="border-success/40 text-success bg-success/5"
          >
            <ShieldCheck className="size-3 mr-1" />
            Agency admin
          </Badge>
        ) : canManage && !isSelf && member.role !== 'viewer' ? (
          <Select
            value={member.role}
            onValueChange={handleRoleChange}
            disabled={pending}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">
                <div className="flex flex-col">
                  <span>Owner</span>
                  <span className="text-[10px] text-muted-foreground">
                    Acceso total
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="admin">
                <div className="flex flex-col">
                  <span>Colaborador</span>
                  <span className="text-[10px] text-muted-foreground">
                    Conversaciones + pausar
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">
            {UI_ROLE_LABELS[member.role as UiRole] ?? member.role}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {member.emailConfirmedAt ? (
          <Badge variant="outline" className="text-green-400 border-green-500/40 bg-green-500/5">
            <CheckCircle2 className="size-3 mr-1" />
            Activo
          </Badge>
        ) : (
          <Badge variant="outline" className="text-warning border-warning/40 bg-warning/5">
            <Clock className="size-3 mr-1" />
            Pendiente
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canManage && !isSelf && !member.isAgencyAdmin ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetPassword}
              disabled={pending}
              title="Enviar email para restablecer contraseña"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  title="Quitar miembro"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Quitar a {member.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Su acceso al panel se desactiva inmediatamente. La cuenta queda
                    en BD para auditoría — puedes reactivarla invitándola de nuevo
                    con el mismo email.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>
                    Quitar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : isSelf ? (
          <span className="text-xs text-muted-foreground">Tú mismo</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

type InviteSuccessPayload =
  | { kind: 'member'; member: MemberRow }
  | { kind: 'invite'; invite: TenantPendingInvite };

function InviteMemberDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
}: {
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (payload: InviteSuccessPayload) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UiRole>('admin');
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteMember({ tenantId, email, role });
      if (result.ok) {
        const sent = result.data?.sent ?? false;
        const userId = result.data?.userId ?? '';
        toast.success(
          sent ? `Invitación enviada a ${email}.` : `Miembro reactivado: ${email}.`,
        );
        if (sent || !userId) {
          // Invitación nueva — el profile aún no existe (se crea al accept-invite).
          // Aparece en la sección "Invitaciones pendientes" hasta que se acepte.
          const now = new Date();
          const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          onSuccess({
            kind: 'invite',
            invite: {
              id: -Math.floor(Math.random() * 100000), // negativo para distinguir invites no persistidos en el state local
              email,
              fullNameHint: null,
              role,
              invitedByEmail: null,
              invitedAt: now.toISOString(),
              tokenExpiresAt: expires.toISOString(),
              isExpired: false,
            },
          });
        } else {
          // Miembro reactivado — profile ya existía (is_active=true ahora).
          onSuccess({
            kind: 'member',
            member: {
              userId,
              email,
              fullName: null,
              role,
              isActive: true,
              isAgencyAdmin: false,
              invitedAt: new Date().toISOString(),
              emailConfirmedAt: null,
              createdAt: new Date().toISOString(),
            },
          });
        }
        setEmail('');
        setRole('admin');
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Card
        className="w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <CardTitle>Invitar miembro</CardTitle>
          <p className="text-xs text-muted-foreground">
            Le enviaremos un email con un enlace para que defina su contraseña.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@email.com"
                required
                disabled={pending}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Rol</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UiRole)}
                disabled={pending}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">
                    <div className="flex flex-col">
                      <span>Owner</span>
                      <span className="text-[10px] text-muted-foreground">
                        {UI_ROLE_DESCRIPTIONS.owner}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex flex-col">
                      <span>Colaborador</span>
                      <span className="text-[10px] text-muted-foreground">
                        {UI_ROLE_DESCRIPTIONS.admin}
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || !email}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar invitación
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
