'use client';

import { useState, useTransition } from 'react';
import { Ban, ShieldOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { setConversationBlocked } from '@/lib/actions/conversations';

interface Props {
  conversationId: number;
  currentlyBlocked: boolean;
  leadName: string;
}

export function BlockAction({ conversationId, currentlyBlocked, leadName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const next = !currentlyBlocked;
      const res = await setConversationBlocked(conversationId, next);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(next ? 'Conversación bloqueada' : 'Conversación desbloqueada');
        setOpen(false);
      }
    });
  };

  const label = currentlyBlocked ? 'Desbloquear' : 'Bloquear';
  const Icon = currentlyBlocked ? ShieldOff : Ban;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                className={currentlyBlocked ? 'text-amber-400 hover:text-amber-400' : ''}
              >
                <Icon className="size-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {currentlyBlocked ? `¿Desbloquear ${leadName}?` : `¿Bloquear ${leadName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {currentlyBlocked
              ? 'La conversación volverá a estar accesible. La IA seguirá pausada — actívala manualmente desde el panel derecho si quieres.'
              : 'La conversación queda bloqueada y la IA pausada para siempre. Puedes desbloquearla más tarde si te equivocas.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
