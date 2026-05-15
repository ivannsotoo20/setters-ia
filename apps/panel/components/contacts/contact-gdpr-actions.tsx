'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  exportContactDataAction,
  deleteContactDataAction,
} from '@/lib/actions/gdpr';

interface Props {
  leadId: number;
  /** Solo visible si true. Owner del tenant o agency admin. */
  canManageGdpr: boolean;
  leadDisplayName: string;
}

const CONFIRMATION_PHRASE = 'ELIMINAR DEFINITIVAMENTE';

export function ContactGdprActions({
  leadId,
  canManageGdpr,
  leadDisplayName,
}: Props) {
  const router = useRouter();
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  if (!canManageGdpr) return null;

  // Hardening 2026-05-15 (audit security HIGH H-7): exportar GDPR descarga PII
  // completa del lead (phone, mensajes, eventos). Pedimos confirmación
  // explícita antes para evitar descargas accidentales en screen-shares.
  const handleExportConfirmed = () => {
    startExport(async () => {
      const res = await exportContactDataAction({ leadId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-lead-${leadId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast.success('Exportación GDPR descargada');
    });
  };

  const handleDelete = () => {
    if (confirmInput !== CONFIRMATION_PHRASE) {
      toast.error(`Escribe "${CONFIRMATION_PHRASE}" para confirmar`);
      return;
    }
    startDelete(async () => {
      const res = await deleteContactDataAction({
        leadId,
        confirmation: confirmInput,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Lead eliminado. ${res.data?.messagesDeleted ?? 0} mensajes, ${res.data?.conversationsDeleted ?? 0} conversaciones, ${res.data?.llmCallsDeleted ?? 0} llamadas IA, ${res.data?.pipelineRunsDeleted ?? 0} pipeline runs borrados.`,
      );
      setDeleteOpen(false);
      router.push('/contacts');
    });
  };

  return (
    <section className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-destructive">
            Acciones GDPR
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cumple con el derecho de acceso (Art. 15) y de borrado (Art. 17) del RGPD. Cualquier
            acción queda registrada en el log de auditoría con tu identidad.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Exportar datos (JSON)
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Eliminar todos los datos
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          if (!exporting) setExportOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5 text-amber-400" />
              Exportar datos personales (GDPR Art. 15)
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2 text-sm">
              <span className="block">
                Descargarás un JSON con <strong>toda la PII</strong> de{' '}
                <strong>{leadDisplayName}</strong> (#{leadId}):
              </span>
              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                <li>Phone, email, nombre, identidades externas</li>
                <li>Mensajes históricos (texto completo de cada mensaje)</li>
                <li>Eventos de pipeline y cambios de fase</li>
                <li>Citas agendadas + URL trackeable</li>
              </ul>
              <span className="block text-xs text-amber-200">
                Trátalo según LOPD/RGPD: cifrado en tránsito al usuario solicitante, borrado
                local tras el envío, NO compartir en chats no cifrados ni screen-share público.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportOpen(false)}
              disabled={exporting}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleExportConfirmed}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Exportando…
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  Descargar JSON
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteOpen(open);
            if (!open) setConfirmInput('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Eliminación GDPR irreversible
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2 text-sm">
              <span className="block">
                Vas a eliminar <strong>todos los datos</strong> asociados al lead{' '}
                <strong>{leadDisplayName}</strong> (#{leadId}):
              </span>
              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                <li>Lead row + identidades externas</li>
                <li>Todas las conversaciones + mensajes + notas</li>
                <li>Eventos de pipeline + etiquetas aplicadas</li>
                <li>Schedules de follow-up + notificaciones</li>
                <li>Llamadas LLM + pipeline runs (costes/tokens históricos)</li>
              </ul>
              <span className="block text-xs">
                Si esta persona vuelve a escribirnos por Instagram, el motor la tratará como
                lead nuevo sin clasificar. Bajo el modo <code>classified_only</code> la IA NO
                responderá (a menos que la actives mediante keyword, lead magnet GHL o bienvenida).
              </span>
              <span className="block text-destructive font-medium">
                Esta acción es permanente. No se puede deshacer.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Escribe <code className="px-1 py-0.5 bg-muted rounded text-xs">{CONFIRMATION_PHRASE}</code> para confirmar:
            </label>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={CONFIRMATION_PHRASE}
              disabled={deleting}
              autoFocus
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setConfirmInput('');
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmInput !== CONFIRMATION_PHRASE}
              className="gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Eliminando…
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Eliminar definitivamente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
