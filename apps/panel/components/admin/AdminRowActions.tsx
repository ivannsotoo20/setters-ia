'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { revokeAdminAction, reactivateAdminAction } from '@/lib/actions/admins';
import { revokeInviteAction, resendInviteEmailAction } from '@/lib/actions/invites';
import { toast } from 'sonner';

/** Acciones para un agency admin existente (revoke/reactivate). */
export function AdminRowActions({
  profileId,
  email,
  isActive,
  isSelf,
}: {
  profileId: string;
  email: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleRevoke() {
    const result = await revokeAdminAction(profileId);
    if (result.ok) {
      toast.success(`Admin ${email} desactivado`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleReactivate() {
    const result = await reactivateAdminAction(profileId);
    if (result.ok) {
      toast.success(`Admin ${email} reactivado`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">Tú</span>;
  }

  if (!isActive) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => startTransition(handleReactivate)}
        disabled={isPending}
      >
        Reactivar
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" disabled={isPending}>
          Desactivar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar a {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            Perderá acceso a /admin/* y al panel inmediatamente. Puede reactivarse después.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => startTransition(handleRevoke)}>
            Sí, desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Acciones para un invite admin pendiente (resend/revoke). */
export function PendingInviteRowActions({
  inviteId,
  email,
  isExpired,
}: {
  inviteId: number;
  email: string;
  isExpired: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleResend() {
    const result = await resendInviteEmailAction(inviteId);
    if (result.ok) {
      toast.success(`Email reenviado a ${email}`);
    } else {
      toast.error(result.error);
    }
  }

  async function handleRevoke() {
    const result = await revokeInviteAction(inviteId);
    if (result.ok) {
      toast.success(`Invitación cancelada`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => startTransition(handleResend)}
        disabled={isPending || isExpired}
        title={isExpired ? 'Caducado — cancela y crea uno nuevo' : 'Reenviar email'}
      >
        Reenviar
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => startTransition(handleRevoke)}
        disabled={isPending}
      >
        Cancelar
      </Button>
    </div>
  );
}
