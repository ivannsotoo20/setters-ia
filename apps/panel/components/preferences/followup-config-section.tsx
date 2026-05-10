'use client';

import { useState, useTransition } from 'react';
import { Clock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  updateTenantFollowupConfig,
  type TenantFollowupConfigRow,
} from '@/lib/actions/followup-config';

interface Props {
  initial: TenantFollowupConfigRow;
  canEdit: boolean;
}

export function FollowupConfigSection({ initial, canEdit }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [windowStart, setWindowStart] = useState(initial.windowStartHour);
  const [windowEnd, setWindowEnd] = useState(initial.windowEndHour);
  const [maxFollowups, setMaxFollowups] = useState(initial.maxFollowupsPerLead);
  const [intervals, setIntervals] = useState<number[]>(initial.intervalsHours);
  const [newInterval, setNewInterval] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  function addInterval() {
    const v = Number(newInterval);
    if (!Number.isInteger(v) || v < 1 || v > 720) {
      toast.error('Intervalo debe ser un entero entre 1 y 720 horas');
      return;
    }
    if (intervals.length >= 10) {
      toast.error('Máximo 10 intervalos');
      return;
    }
    setIntervals((cur) => [...cur, v].sort((a, b) => a - b));
    setNewInterval('');
  }

  function removeInterval(idx: number) {
    setIntervals((cur) => cur.filter((_, i) => i !== idx));
  }

  function onSave() {
    if (intervals.length === 0) {
      toast.error('Debes definir al menos un intervalo');
      return;
    }
    if (windowStart >= windowEnd) {
      toast.error('Hora inicio debe ser menor que hora fin');
      return;
    }
    startTransition(async () => {
      const r = await updateTenantFollowupConfig({
        enabled,
        windowStartHour: windowStart,
        windowEndHour: windowEnd,
        maxFollowupsPerLead: maxFollowups,
        intervalsHours: intervals,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success('Configuración guardada');
    });
  }

  function formatInterval(h: number): string {
    if (h % 168 === 0) {
      const w = h / 168;
      return `${w} sem${w === 1 ? '' : 'anas'}`;
    }
    if (h % 24 === 0) {
      const d = h / 24;
      return `${d} día${d === 1 ? '' : 's'}`;
    }
    return `${h}h`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-amber-400" />
          Followups automáticos
          {!enabled ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              desactivado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-normal text-emerald-500 border-emerald-500/40">
              activo
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Cuando un lead lleve <strong>X horas inactivo</strong>, el motor le envía un
          followup automáticamente respetando el horario y el máximo configurado.
          IG/FB usan plantillas con AI-personalize si están definidas; WhatsApp usa
          plantillas YCloud aprobadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2">
          <Label htmlFor="fl-enabled" className="text-sm cursor-pointer">
            Activar envío automático de followups
          </Label>
          <Switch
            id="fl-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-start" className="text-xs">
              Hora inicio (no enviar antes)
            </Label>
            <Input
              id="win-start"
              type="number"
              min={0}
              max={23}
              value={windowStart}
              onChange={(e) => setWindowStart(Number(e.target.value))}
              disabled={!canEdit}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-end" className="text-xs">
              Hora fin (no enviar después)
            </Label>
            <Input
              id="win-end"
              type="number"
              min={0}
              max={23}
              value={windowEnd}
              onChange={(e) => setWindowEnd(Number(e.target.value))}
              disabled={!canEdit}
              className="text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-2">
          Timezone fijo {initial.windowTimezone} (configurable vía script si necesitas otra).
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="max-fl" className="text-xs">
            Máximo de followups por lead
          </Label>
          <Input
            id="max-fl"
            type="number"
            min={1}
            max={10}
            value={maxFollowups}
            onChange={(e) => setMaxFollowups(Number(e.target.value))}
            disabled={!canEdit}
            className="text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Tras enviar este número de followups sin respuesta, el motor deja al lead en paz.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Intervalos (horas tras el último contacto)</Label>
          <p className="text-[10px] text-muted-foreground">
            Followup #1 a las X horas del último mensaje, #2 a las Y horas, etc.
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {intervals.map((h, idx) => (
              <Badge key={idx} variant="secondary" className="gap-1 text-xs">
                #{idx + 1}: {formatInterval(h)}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeInterval(idx)}
                    className="hover:text-rose-500"
                    aria-label={`Quitar intervalo ${idx + 1}`}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </Badge>
            ))}
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={1}
                max={720}
                placeholder="horas (1-720)"
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                className="text-xs w-32 h-8"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addInterval}
                disabled={!newInterval}
                className="h-8"
              >
                <Plus className="size-3 mr-1" />
                Añadir
              </Button>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button onClick={onSave} disabled={isPending} size="sm">
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
