'use client';

import { useState, useTransition } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  updateTenantFollowupConfig,
  type TenantFollowupConfigRow,
} from '@/lib/actions/followup-config';
import { IntervalsTimeline } from './intervals-timeline';

interface Props {
  initial: TenantFollowupConfigRow;
  canEdit: boolean;
}

export function FollowupConfigBlock({ initial, canEdit }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [intervals, setIntervals] = useState<number[]>(
    initial.intervalsHours.filter((h) => h >= 1 && h <= 24),
  );
  const [windowStart, setWindowStart] = useState(initial.windowStartHour);
  const [windowEnd, setWindowEnd] = useState(initial.windowEndHour);
  const [autoPersonalize, setAutoPersonalize] = useState(initial.autoPersonalize);
  const [defaultText, setDefaultText] = useState(initial.defaultFollowupText ?? '');
  const [isPending, startTransition] = useTransition();

  const dirty =
    enabled !== initial.enabled ||
    JSON.stringify(intervals) !== JSON.stringify(initial.intervalsHours) ||
    windowStart !== initial.windowStartHour ||
    windowEnd !== initial.windowEndHour ||
    autoPersonalize !== initial.autoPersonalize ||
    defaultText.trim() !== (initial.defaultFollowupText ?? '').trim();

  function onSave() {
    if (windowStart >= windowEnd) {
      toast.error('La hora inicio del horario activo debe ser menor que la hora fin');
      return;
    }
    if (intervals.length === 0 && enabled) {
      toast.error('Añade al menos un seguimiento o desactiva el sistema');
      return;
    }
    startTransition(async () => {
      const r = await updateTenantFollowupConfig({
        enabled,
        intervalsHours: intervals,
        maxFollowupsPerLead: Math.max(1, intervals.length),
        windowStartHour: windowStart,
        windowEndHour: windowEnd,
        autoPersonalize,
        defaultFollowupText: defaultText.trim() || null,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success('Configuración guardada');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-amber-400" />
          Configuración global de seguimientos
          {enabled ? (
            <Badge
              variant="outline"
              className="text-[10px] font-normal text-emerald-500 border-emerald-500/40"
            >
              activo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-normal">
              desactivado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Cuando un lead deja de responder, el motor le envía hasta N seguimientos
          dentro de las primeras 24h (límite Meta/GHL). Configura cuándo, cuántos y
          cómo se personalizan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Toggle global */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
          <Label htmlFor="fl-enabled" className="text-sm cursor-pointer">
            Activar seguimientos automáticos
          </Label>
          <Switch
            id="fl-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit}
          />
        </div>

        {/* Timeline visual */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Cuándo enviar (horas tras último mensaje del lead)</Label>
          <IntervalsTimeline
            intervals={intervals}
            onChange={setIntervals}
            disabled={!canEdit || !enabled}
            maxFollowups={5}
          />
        </div>

        {/* Horario activo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-start" className="text-xs">
              Horario inicio (no enviar antes)
            </Label>
            <Input
              id="win-start"
              type="number"
              min={0}
              max={23}
              value={windowStart}
              onChange={(e) => setWindowStart(Number(e.target.value))}
              disabled={!canEdit || !enabled}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-end" className="text-xs">
              Horario fin (no enviar después)
            </Label>
            <Input
              id="win-end"
              type="number"
              min={0}
              max={23}
              value={windowEnd}
              onChange={(e) => setWindowEnd(Number(e.target.value))}
              disabled={!canEdit || !enabled}
              className="text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-3">
          Timezone {initial.windowTimezone}. Si la hora del seguimiento cae fuera del
          horario, se mueve al próximo slot dentro.
        </p>

        {/* Toggle personalizar IA */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor="auto-personalize" className="text-sm cursor-pointer flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-500" />
              Personalizar Instagram + Facebook con IA
            </Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ON: el motor genera un mensaje único contextual por cada lead usando los
              últimos mensajes de la conversación. OFF: usa el texto fijo de abajo
              igual para todos.
            </p>
          </div>
          <Switch
            id="auto-personalize"
            checked={autoPersonalize}
            onCheckedChange={setAutoPersonalize}
            disabled={!canEdit || !enabled}
          />
        </div>

        {/* Default text fallback */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default-text" className="text-xs">
            Mensaje predeterminado IG/FB{' '}
            <span className="text-muted-foreground">
              {autoPersonalize
                ? '(fallback si no hay material para personalizar)'
                : '(se enviará igual a todos los leads)'}
            </span>
          </Label>
          <textarea
            id="default-text"
            value={defaultText}
            onChange={(e) => setDefaultText(e.target.value)}
            maxLength={4000}
            placeholder="ej. Hola, ¿pudiste ver mi mensaje? Me gustaría saber si sigues interesado/a 🙂"
            disabled={!canEdit || !enabled}
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <p className="text-[10px] text-muted-foreground">
            Solo aplica a Instagram y Facebook. WhatsApp siempre usa plantillas YCloud
            aprobadas (Meta bloquea texto libre fuera de la ventana 24h).
          </p>
        </div>

        {canEdit ? (
          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button onClick={onSave} disabled={isPending || !dirty} size="sm">
              {isPending ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            Solo el owner puede modificar esta configuración.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
