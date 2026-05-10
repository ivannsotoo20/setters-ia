'use client';

import { useState, useTransition, useMemo } from 'react';
import { Clock, Sparkles, AlertTriangle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  scheduleFollowup,
  type ChannelKind,
  type FollowupTemplateRow,
} from '@/lib/actions/followups';

interface Props {
  conversationId: number;
  channelKind: ChannelKind;
  /** Última hora del lead — para detectar window 24h en WA. */
  lastLeadMessageAt: string | null;
  templates: FollowupTemplateRow[];
  trigger?: React.ReactNode;
}

const NO_TEMPLATE = '__none__';
const CHANNEL_LABELS: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

function defaultDateTimeLocal(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleFollowupDialog({
  conversationId,
  channelKind,
  lastLeadMessageAt,
  templates,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState(defaultDateTimeLocal());
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [body, setBody] = useState('');
  const [autoCancel, setAutoCancel] = useState(true);
  const [aiPersonalize, setAiPersonalize] = useState(false);
  const [aiGuide, setAiGuide] = useState('');
  const [isPending, startTransition] = useTransition();

  const isWA = channelKind === 'whatsapp';
  const channelTemplates = useMemo(
    () => templates.filter((t) => t.channelKind === channelKind && t.status === 'approved'),
    [templates, channelKind],
  );

  const isOver24h = useMemo(() => {
    if (!lastLeadMessageAt) return true;
    const ms = Date.parse(lastLeadMessageAt);
    if (!Number.isFinite(ms)) return true;
    return Date.now() - ms > 24 * 60 * 60 * 1000;
  }, [lastLeadMessageAt]);

  const requiresTemplate = isWA && isOver24h;

  const charsLeft = 4000 - body.length;
  const guideLeft = 2000 - aiGuide.length;

  function reset() {
    setScheduledLocal(defaultDateTimeLocal());
    setTemplateId(NO_TEMPLATE);
    setBody('');
    setAutoCancel(true);
    setAiPersonalize(false);
    setAiGuide('');
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === NO_TEMPLATE) {
      setBody('');
      setAiPersonalize(false);
      setAiGuide('');
      return;
    }
    const tpl = channelTemplates.find((t) => String(t.id) === id);
    if (!tpl) return;
    if (tpl.aiPersonalize) {
      setAiPersonalize(true);
      setAiGuide(tpl.aiGuide ?? '');
      setBody('');
    } else {
      setAiPersonalize(false);
      setBody(tpl.body ?? '');
      setAiGuide('');
    }
  }

  function onSubmit() {
    if (requiresTemplate && templateId === NO_TEMPLATE) {
      toast.error(
        'WhatsApp pasadas las 24h: tienes que elegir una plantilla aprobada YCloud (texto libre bloqueado por política Meta)',
      );
      return;
    }
    if (!aiPersonalize && templateId === NO_TEMPLATE && !body.trim()) {
      toast.error('Mensaje vacío');
      return;
    }
    if (aiPersonalize && !aiGuide.trim() && templateId === NO_TEMPLATE) {
      toast.error('AI-personalize requiere guía');
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
        body: body.trim() || undefined,
        templateId: templateId === NO_TEMPLATE ? null : Number(templateId),
        scheduledAtIso: localDate.toISOString(),
        autoCancelOnReply: autoCancel,
        aiPersonalize: aiPersonalize || undefined,
        aiGuide: aiPersonalize ? aiGuide.trim() : undefined,
      });
      if (!r.ok) toast.error(r.error);
      else {
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
          <DialogTitle className="flex items-center gap-2">
            Programar followup
            <Badge variant="outline" className="text-[10px] font-normal">
              {CHANNEL_LABELS[channelKind]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Si el lead responde antes de la hora, el followup se cancela automáticamente
            (si tienes activo "auto-cancelar").
          </DialogDescription>
        </DialogHeader>

        {requiresTemplate ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 flex items-start gap-2 text-xs">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Han pasado más de 24h del último mensaje del lead. WhatsApp/Meta solo
              permite plantillas aprobadas YCloud — texto libre bloqueado para evitar
              que Meta bloquee el número.
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 py-2">
          {channelTemplates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl" className="text-xs">
                Plantilla {requiresTemplate ? '(obligatoria)' : '(opcional)'}
              </Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger id="tpl" className="text-xs">
                  <SelectValue placeholder="Selecciona plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {!requiresTemplate ? (
                    <SelectItem value={NO_TEMPLATE} className="text-xs">
                      Sin plantilla — escribir manual
                    </SelectItem>
                  ) : null}
                  {channelTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{t.name}</span>
                        {t.aiPersonalize ? (
                          <Sparkles className="size-2.5 text-amber-500" />
                        ) : null}
                        {t.language ? (
                          <span className="text-[10px] text-muted-foreground">({t.language})</span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : requiresTemplate ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
              No hay plantillas WhatsApp aprobadas. Sincroniza desde YCloud en{' '}
              <span className="underline">/settings/followup-templates</span>.
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

          {!isWA && templateId === NO_TEMPLATE ? (
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-amber-500" />
                <Label htmlFor="ai-personalize" className="text-xs cursor-pointer">
                  Personalizar con IA al enviar
                </Label>
              </div>
              <Switch
                id="ai-personalize"
                checked={aiPersonalize}
                onCheckedChange={setAiPersonalize}
              />
            </div>
          ) : null}

          {aiPersonalize && templateId === NO_TEMPLATE ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guide" className="text-xs">
                Guía IA{' '}
                <span className={guideLeft < 0 ? 'text-rose-500' : 'text-muted-foreground'}>
                  ({guideLeft})
                </span>
              </Label>
              <textarea
                id="guide"
                value={aiGuide}
                onChange={(e) => setAiGuide(e.target.value)}
                maxLength={2000}
                placeholder="ej. 'Recordar al lead la propuesta de llamada que se le hizo, tono cercano, referirse a algo concreto que dijo'"
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          ) : templateId === NO_TEMPLATE && !aiPersonalize ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body" className="text-xs">
                Mensaje{' '}
                <span className={charsLeft < 0 ? 'text-rose-500' : 'text-muted-foreground'}>
                  ({charsLeft})
                </span>
              </Label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                placeholder="Escribe el mensaje que se enviará al lead…"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          ) : null}

          {templateId !== NO_TEMPLATE ? (
            <div className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
              {aiPersonalize ? (
                <>
                  <span className="text-amber-500 font-medium">AI-personalize:</span> el motor
                  generará el mensaje contextual al enviar usando los últimos mensajes de la
                  conversación + la guía de la plantilla.
                </>
              ) : (
                <span className="line-clamp-3 whitespace-pre-wrap">{body}</span>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="auto-cancel" className="text-xs">
              Auto-cancelar si el lead responde
            </Label>
            <Switch id="auto-cancel" checked={autoCancel} onCheckedChange={setAutoCancel} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isPending}>
            {isPending ? 'Programando…' : 'Programar followup'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
