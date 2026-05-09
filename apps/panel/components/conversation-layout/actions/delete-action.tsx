'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
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
import { deleteConversation } from '@/lib/actions/conversations';

interface Props {
  conversationId: number;
  leadName: string;
}

const CONFIRM_WORD = 'eliminar';

export function DeleteAction({ conversationId, leadName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const canConfirm = typed.trim().toLowerCase() === CONFIRM_WORD && !pending;

  const onConfirm = () => {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await deleteConversation(conversationId);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success('Conversación eliminada');
        setOpen(false);
        setTyped('');
        router.replace('/conversations');
      }
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
    >
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Eliminar conversación"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Eliminar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar conversación con {leadName}</AlertDialogTitle>
          <AlertDialogDescription>
            La conversación se cierra y bloquea (soft-delete). El lead deja de recibir
            mensajes IA. Para confirmar escribe «{CONFIRM_WORD}» abajo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-delete" className="text-xs uppercase tracking-wider text-muted-foreground">
            Confirmación
          </Label>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={pending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
