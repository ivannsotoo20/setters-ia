'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { deleteFollowupTemplate } from '@/lib/actions/followups';

interface Props {
  templateId: number;
  templateName: string;
  isYCloud?: boolean;
}

export function DeleteTemplateDialog({ templateId, templateName, isYCloud }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const r = await deleteFollowupTemplate(templateId);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success('Plantilla eliminada');
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive/80">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar plantilla "{templateName}"</AlertDialogTitle>
          <AlertDialogDescription>
            Los followups ya programados que usaron esta plantilla seguirán activos
            (su template_id quedará en null).
            {isYCloud
              ? ' Como esta plantilla está sincronizada desde YCloud, volverá a aparecer al hacer "Sincronizar" si sigue aprobada en YCloud.'
              : ' Esta acción no se puede deshacer.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isPending ? 'Eliminando…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
