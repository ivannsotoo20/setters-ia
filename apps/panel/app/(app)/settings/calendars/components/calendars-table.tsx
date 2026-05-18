'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, StarOff, Unlink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  setDefaultCalendar,
  setCalendarChannelKind,
  unlinkCalendar,
  type CalendarAccountRow,
  type CalendarChannelKind,
} from '@/lib/actions/calendars';

interface Props {
  calendars: CalendarAccountRow[];
}

const ANY_CHANNEL_VALUE = '__any__';

const CHANNEL_LABEL: Record<NonNullable<CalendarChannelKind>, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

export function CalendarsTable({ calendars }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: number; name: string } | null>(null);
  const [, startTransition] = useTransition();

  async function handleSetDefault(id: number) {
    setPendingId(id);
    try {
      const r = await setDefaultCalendar(id);
      if (!r.ok) {
        toast.error(`No se pudo marcar como default: ${r.error}`);
        return;
      }
      toast.success('Calendario default actualizado');
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  async function handleChangeChannel(id: number, raw: string) {
    const next: CalendarChannelKind = raw === ANY_CHANNEL_VALUE ? null : (raw as CalendarChannelKind);
    setPendingId(id);
    try {
      const r = await setCalendarChannelKind(id, next);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        next == null
          ? 'Calendario asignado a "cualquier canal"'
          : `Calendario asignado a ${CHANNEL_LABEL[next]}`,
      );
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  // Hardening 2026-05-15 (audit UX): AlertDialog en lugar de window.confirm() — consistencia UI + accesibilidad.
  async function performUnlink() {
    if (!unlinkTarget) return;
    const id = unlinkTarget.id;
    setUnlinkTarget(null);
    setPendingId(id);
    try {
      const r = await unlinkCalendar(id);
      if (!r.ok) {
        toast.error(`No se pudo desvincular: ${r.error}`);
        return;
      }
      toast.success('Calendario desvinculado');
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col divide-y border rounded-md">
      {calendars.map((cal) => (
        <div
          key={cal.id}
          className="flex items-center justify-between gap-3 p-3 flex-wrap"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{cal.name}</p>
              {cal.isDefault && cal.isActive && (
                <Badge variant="default" className="text-[10px]">
                  default · F6
                </Badge>
              )}
              {!cal.isActive && (
                <Badge variant="outline" className="text-[10px]">
                  desvinculado
                </Badge>
              )}
              {cal.channelKind != null && (
                <Badge variant="secondary" className="text-[10px]">
                  canal: {CHANNEL_LABEL[cal.channelKind]}
                </Badge>
              )}
            </div>
            {cal.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {cal.description}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
              {cal.externalCalendarId}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {cal.isActive && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Canal
                </span>
                <Select
                  value={cal.channelKind ?? ANY_CHANNEL_VALUE}
                  onValueChange={(v) => handleChangeChannel(cal.id, v)}
                  disabled={pendingId === cal.id}
                >
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Cualquier canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_CHANNEL_VALUE}>Cualquier canal</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram_dm">Instagram</SelectItem>
                    <SelectItem value="facebook_messenger">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {cal.isActive && !cal.isDefault && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSetDefault(cal.id)}
                disabled={pendingId === cal.id}
                title="Marcar como default (el que recibe el lead en F6)"
              >
                {pendingId === cal.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Star className="h-3 w-3 mr-1" /> Default
                  </>
                )}
              </Button>
            )}
            {cal.isActive && cal.isDefault && (
              <Badge variant="secondary" className="gap-1">
                <StarOff className="h-3 w-3" /> Activo
              </Badge>
            )}
            {cal.isActive && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUnlinkTarget({ id: cal.id, name: cal.name })}
                disabled={pendingId === cal.id}
                title="Desvincular del SaaS (no borra del GHL)"
              >
                <Unlink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
      <AlertDialog
        open={unlinkTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular calendario</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a desvincular <strong>{unlinkTarget?.name ?? ''}</strong>. Esto:
              <ul className="list-disc list-inside text-xs mt-2 space-y-0.5">
                <li>Detiene la recepción de nuevas citas en este calendar.</li>
                <li>Las citas históricas <strong>se mantienen visibles</strong>.</li>
                <li>El calendar SIGUE existiendo en GHL — solo se rompe la vinculación con el SaaS.</li>
                <li>Puedes re-vincular el mismo calendar después sin duplicar datos.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={performUnlink}>
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
