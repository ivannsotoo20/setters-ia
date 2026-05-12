'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
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
import { deleteContactDataAction } from '@/lib/actions/gdpr';

interface Props {
  /** Lead a eliminar — borra TODO el lead, no solo la conversación. */
  leadId: number;
  /** Solo para mostrar el nombre en el dialog. */
  leadName: string;
}

const CONFIRMATION_PHRASE = 'ELIMINAR DEFINITIVAMENTE';

/**
 * Sprint Iota.3 — Hard-delete del lead completo desde la conversación.
 *
 * Doctrina (Iván 2026-05-12): el botón papelera elimina TODO el lead
 * (conversaciones, mensajes, llm_calls, pipeline_runs, notification_events).
 * Sin rastro. Si el mismo contacto vuelve a escribir, motor crea lead nuevo
 * sin source clasificada → bajo `*_inbound_mode='classified_only'` la IA
 * queda pausada hasta intervención humana.
 *
 * Equivalente al GDPR delete (Art. 17) que ya existe en /contacts/[id].
 */
export function DeleteAction({ leadId, leadName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const canConfirm = typed === CONFIRMATION_PHRASE && !pending;

  const onConfirm = () => {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await deleteContactDataAction({
        leadId,
        confirmation: CONFIRMATION_PHRASE,
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success(
        `Lead eliminado. ${res.data?.conversationsDeleted ?? 0} conversaciones, ` +
          `${res.data?.messagesDeleted ?? 0} mensajes, ` +
          `${res.data?.llmCallsDeleted ?? 0} llamadas IA, ` +
          `${res.data?.pipelineRunsDeleted ?? 0} pipeline runs borrados.`,
      );
      setOpen(false);
      setTyped('');
      router.replace('/conversations');
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
                aria-label="Eliminar contacto"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Eliminar contacto</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Eliminar contacto {leadName}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Se borrarán <strong>todas</strong> las conversaciones, mensajes,
                llamadas a IA, pipeline runs y notificaciones de este lead.
                Esta acción es <strong>irreversible</strong>.
              </p>
              <p className="text-muted-foreground">
                Si el contacto vuelve a escribir, será tratado como un lead nuevo
                sin historial y la IA quedará pausada hasta que la actives
                manualmente o se cumpla una keyword.
              </p>
              <p>
                Para confirmar, escribe{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {CONFIRMATION_PHRASE}
                </code>{' '}
                abajo.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="confirm-delete"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Confirmación
          </Label>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRMATION_PHRASE}
            autoComplete="off"
            disabled={pending}
            spellCheck={false}
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
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Eliminar contacto
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
