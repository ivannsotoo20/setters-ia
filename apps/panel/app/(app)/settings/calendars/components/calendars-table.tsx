'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, StarOff, Unlink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  setDefaultCalendar,
  unlinkCalendar,
  type CalendarAccountRow,
} from '@/lib/actions/calendars';

interface Props {
  calendars: CalendarAccountRow[];
}

export function CalendarsTable({ calendars }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [_, startTransition] = useTransition();

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

  async function handleUnlink(id: number, name: string) {
    if (!confirm(`¿Desvincular "${name}"? Las citas históricas se mantienen.`)) {
      return;
    }
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
          className="flex items-center justify-between gap-3 p-3"
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
          <div className="flex items-center gap-2 shrink-0">
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
                onClick={() => handleUnlink(cal.id, cal.name)}
                disabled={pendingId === cal.id}
                title="Desvincular del SaaS (no borra del GHL)"
              >
                <Unlink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
