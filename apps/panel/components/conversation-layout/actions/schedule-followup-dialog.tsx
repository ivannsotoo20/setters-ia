'use client';

import { useState, useTransition, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { scheduleFollowup, type FollowupTemplateRow } from '@/lib/actions/followups';

interface Props {
  conversationId: number;
  templates: FollowupTemplateRow[];
  trigger?: React.ReactNode;
}

const NO_TEMPLATE = '__none__';

function defaultDateTimeLocal(): string {
  // 24h en futuro por defecto
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // formato datetime-local: YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleFollowupDialog({ conversationId, templates, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState(defaultDateTimeLocal());
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [autoCancel, setAutoCancel] = useState(true);
  const [isPending, startTransition] = useTransition();

  const charsLeft = useMemo(() => 4000 - body.length, [body]);

  function reset() {
    setBody('');
    setScheduledLocal(defaultDateTimeLocal());
    setTemplateId(NO_TEMPLATE);
    setAutoCancel(true);
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === NO_TEMPLATE) return;
    const tpl = templates.find((t) => String(t.id) === id);
    if (tpl) setBody(tpl.body);
  }

  function onSubmit() {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error('Mensaje vacío');
      return;
    }
    const localDate = new Date(scheduledLocal);
    if (Number.isNaN(localDate.getTime())) {
      toast.error('Fecha inválida');
      return;
    }
    if (localDate.getTime() <= Date.now() + 30_000) {
      toast.error('La fecha debe ser al menos 30s en el futuro');
      return;
    }

    startTransition(async () => {
      const r = await scheduleFollowup({
        conversationId,
        body: trimmed,
        scheduledAtIso: localDate.toISOString(),
        templateId: templateId === NO_TEMPLATE ? null : Number(templateId),
        autoCancelOnReply: autoCancel,
      });
      if (!r.ok) {
        toast.error(r.error);
      } else {
        toast.success('Followup programado');
        reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Clock className="size-3 mr-1" />
            Programar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Programar followup</DialogTitle>
          <DialogDescription>
            Envía un mensaje en una fecha futura. Si el lead responde antes y
            tienes activo "auto-cancelar", el followup se cancela solo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {templates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl" className="text-xs">
                Plantilla (opcional)
              </Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger id="tpl" className="text-xs">
                  <SelectValue placeholder="Sin plantilla" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE} className="text-xs">
                    Sin plantilla — escribir manual
                  </SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{t.name}</span>
                        {t.description ? (
                          <span className="text-[10px] text-muted-foreground">
                            {t.description}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="when" className="text-xs">
              Fecha y hora del envío
            </Label>
            <Input
              id="when"
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body" className="text-xs">
              Mensaje{' '}
              <span className={charsLeft < 0 ? 'text-rose-500' : 'text-muted-foreground'}>
                ({charsLeft} restantes)
              </span>
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe el mensaje que se enviará al lead…"
              maxLength={4000}
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label
                    htmlFor="auto-cancel"
                    className="text-xs cursor-help flex items-center gap-1"
                  >
                    Auto-cancelar si el lead responde
                  </Label>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  Si el lead te escribe antes de la hora programada, el followup se cancela
                  automáticamente para evitar mensaje obsoleto. Recomendado para reminders y
                  follow-ups conversacionales.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch id="auto-cancel" checked={autoCancel} onCheckedChange={setAutoCancel} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isPending || charsLeft < 0}>
            {isPending ? 'Programando…' : 'Programar followup'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
