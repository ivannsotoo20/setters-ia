'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  Clock,
  X,
  Send,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Pin,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  cancelScheduledFollowup,
  regenerateFollowupMessage,
  sendScheduledFollowupNow,
  type ScheduledFollowupRow,
  type ChannelKind,
} from '@/lib/actions/followups';
import type { TenantFollowupConfigRow } from '@/lib/actions/followup-config';

interface Props {
  followups: ScheduledFollowupRow[];
  config: TenantFollowupConfigRow;
  channelKind: ChannelKind;
  lastLeadMessageAt: string | null;
  canManage: boolean;
}

const CHANNEL_LABELS: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hoy ${time}`;
  if (isTomorrow) return `Mañana ${time}`;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeShort(ms: number): string {
  if (ms <= 0) return 'enviando';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (day > 0) return `${day}d ${hour % 24}h`;
  if (hour > 0) return `${hour}h ${min % 60}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

export function AutomatedFollowupsPanel({
  followups,
  config,
  channelKind,
  lastLeadMessageAt,
  canManage,
}: Props) {
  const pending = followups.filter(
    (f) => f.status === 'pending' || f.status === 'processing',
  );
  const recentSent = followups
    .filter((f) => f.status === 'sent')
    .sort((a, b) => Date.parse(b.sentAt ?? '') - Date.parse(a.sentAt ?? ''))
    .slice(0, 2);

  const sentCount = followups.filter(
    (f) => f.triggeredBy === 'auto_inactivity' && (f.status === 'sent' || f.status === 'processing'),
  ).length;
  const maxFollowups = config.maxFollowupsPerLead ?? config.intervalsHours.length;

  // Detectar si el lead ya está fuera de la ventana 24h (regla Meta).
  const lastLeadMs = lastLeadMessageAt ? Date.parse(lastLeadMessageAt) : 0;
  const hoursSinceLead = lastLeadMs ? (Date.now() - lastLeadMs) / 3600000 : 0;
  const leadOutOf24hWindow = lastLeadMs > 0 && hoursSinceLead > 24;

  // Estado del header
  let badge: {
    label: string;
    tone: 'active' | 'off' | 'waiting' | 'done' | 'wa-blocked' | 'out-of-window';
  };
  if (!config.enabled) {
    badge = { label: 'desactivado', tone: 'off' };
  } else if (leadOutOf24hWindow && pending.length === 0) {
    badge = { label: 'fuera de ventana', tone: 'out-of-window' };
  } else if (channelKind === 'whatsapp') {
    if (leadOutOf24hWindow) badge = { label: 'WhatsApp 24h', tone: 'wa-blocked' };
    else badge = { label: `${pending.length} programados`, tone: 'active' };
  } else if (sentCount >= maxFollowups) {
    badge = { label: `${sentCount}/${maxFollowups} enviados`, tone: 'done' };
  } else if (pending.length === 0) {
    if (hoursSinceLead < 1) badge = { label: 'esperando ventana', tone: 'waiting' };
    else badge = { label: 'sin programar', tone: 'waiting' };
  } else {
    badge = { label: `${pending.length}/${maxFollowups}`, tone: 'active' };
  }

  return (
    <div className="border-t border-border/60 pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Seguimientos automáticos
        </span>
        <Badge
          variant="outline"
          className={cn(
            'h-4 text-[9px] px-1.5 font-normal',
            badge.tone === 'active' && 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5',
            badge.tone === 'off' && 'border-muted-foreground/30 text-muted-foreground',
            badge.tone === 'waiting' && 'border-sky-500/40 text-sky-400 bg-sky-500/5',
            badge.tone === 'done' && 'border-amber-500/40 text-amber-400 bg-amber-500/5',
            badge.tone === 'wa-blocked' && 'border-rose-500/40 text-rose-400 bg-rose-500/5',
            badge.tone === 'out-of-window' && 'border-muted-foreground/40 text-muted-foreground bg-muted/30',
          )}
        >
          {badge.label}
        </Badge>
      </div>

      <Body
        config={config}
        channelKind={channelKind}
        lastLeadMessageAt={lastLeadMessageAt}
        pending={pending}
        recentSent={recentSent}
        sentCount={sentCount}
        maxFollowups={maxFollowups}
        canManage={canManage}
      />
    </div>
  );
}

function Body({
  config,
  channelKind,
  lastLeadMessageAt,
  pending,
  recentSent,
  sentCount,
  maxFollowups,
  canManage,
}: {
  config: TenantFollowupConfigRow;
  channelKind: ChannelKind;
  lastLeadMessageAt: string | null;
  pending: ScheduledFollowupRow[];
  recentSent: ScheduledFollowupRow[];
  sentCount: number;
  maxFollowups: number;
  canManage: boolean;
}) {
  // Empty state 1: config OFF
  if (!config.enabled) {
    return (
      <div className="rounded-md border border-dashed border-border/50 bg-muted/10 p-3 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Los seguimientos automáticos están desactivados para este tenant.
        </p>
        {canManage ? (
          <Link
            href="/settings/followup-templates"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Settings className="size-3" />
            Configurar
          </Link>
        ) : null}
      </div>
    );
  }

  // Empty state 2: WhatsApp >24h sin templates aprobadas
  if (channelKind === 'whatsapp') {
    const lastMs = lastLeadMessageAt ? Date.parse(lastLeadMessageAt) : 0;
    const isOver24h = !lastMs || Date.now() - lastMs > 24 * 3600 * 1000;
    if (isOver24h && pending.length === 0) {
      return (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 flex flex-col gap-2">
          <p className="text-xs text-foreground/80">
            <strong>WhatsApp pasadas 24h:</strong> Meta solo permite plantillas aprobadas
            YCloud. Sincroniza tus plantillas en Configuración para programar seguimientos.
          </p>
          {canManage ? (
            <Link
              href="/settings/followup-templates"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Settings className="size-3" />
              Ir a plantillas WhatsApp
            </Link>
          ) : null}
        </div>
      );
    }
  }

  // Empty state 3: max alcanzado
  if (sentCount >= maxFollowups && pending.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-foreground/80">
        Secuencia completa enviada ({sentCount}/{maxFollowups}). El lead no respondió a
        los seguimientos.
      </div>
    );
  }

  // Empty state 3.5: lead inactivo >24h (fuera de ventana Meta)
  if (pending.length === 0 && lastLeadMessageAt) {
    const hoursSince = (Date.now() - Date.parse(lastLeadMessageAt)) / 3600000;
    if (hoursSince > 24) {
      return (
        <div className="rounded-md border border-muted-foreground/40 bg-muted/30 p-3 flex flex-col gap-1.5 text-xs text-foreground/80">
          <p>
            <strong>El lead lleva {Math.round(hoursSince)}h sin responder.</strong>
          </p>
          <p className="text-muted-foreground">
            Los seguimientos automáticos solo se programan dentro de las primeras
            24h tras el último mensaje del lead (regla Meta para WhatsApp; convención
            general para Instagram y Facebook). Si quieres reactivar este lead,
            envíale un mensaje manual desde el chat.
          </p>
        </div>
      );
    }
  }

  // Empty state 4: lead acaba de escribir (esperando ventana)
  if (pending.length === 0 && lastLeadMessageAt) {
    const minutesSince = (Date.now() - Date.parse(lastLeadMessageAt)) / 60000;
    if (minutesSince < 60) {
      return (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-foreground/80">
          El lead escribió hace {Math.round(minutesSince)}min. Los seguimientos
          automáticos se preparan cuando pasen las primeras horas configuradas.
        </div>
      );
    }
  }

  // Empty state 5: ningún pending y todavía no se ha cumplido el primer interval
  if (pending.length === 0 && recentSent.length === 0) {
    return (
      <div className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground">
        Sin seguimientos programados todavía. Cuando el lead lleve unas horas sin
        responder, aparecerán aquí automáticamente.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {pending.map((f) => (
        <FollowupCard key={f.id} followup={f} canManage={canManage} variant="pending" />
      ))}
      {recentSent.map((f) => (
        <FollowupCard key={f.id} followup={f} canManage={canManage} variant="sent" />
      ))}
    </div>
  );
}

function FollowupCard({
  followup,
  canManage,
  variant,
}: {
  followup: ScheduledFollowupRow;
  canManage: boolean;
  variant: 'pending' | 'sent';
}) {
  const [now, setNow] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const isPendingStatus =
    followup.status === 'pending' || followup.status === 'processing';

  useEffect(() => {
    if (!isPendingStatus) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isPendingStatus]);

  const scheduledMs = Date.parse(followup.scheduledAtIso);
  const remainingMs = scheduledMs - now;

  function onSendNow() {
    if (!confirm('¿Enviar este seguimiento ahora? El motor lo enviará en ~30s.')) return;
    startTransition(async () => {
      const r = await sendScheduledFollowupNow(followup.id);
      if (!r.ok) toast.error(r.error);
      else toast.success('Adelantado — se enviará en breve');
    });
  }

  function onCancel() {
    if (!confirm('¿Cancelar este seguimiento programado?')) return;
    startTransition(async () => {
      const r = await cancelScheduledFollowup(followup.id);
      if (!r.ok) toast.error(r.error);
      else toast.success('Seguimiento cancelado');
    });
  }

  function onRegenerate() {
    startTransition(async () => {
      const r = await regenerateFollowupMessage(followup.id);
      if (!r.ok) toast.error(r.error);
      else toast.success('Mensaje regenerado con contexto actual');
    });
  }

  const seqLabel = followup.sequenceIndex ? `FU #${followup.sequenceIndex}` : 'FU';

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2 text-xs flex flex-col gap-1.5',
        variant === 'pending' && 'border-amber-500/30 bg-amber-500/5',
        variant === 'sent' && 'border-emerald-500/30 bg-emerald-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {variant === 'pending' ? (
            <Clock className="size-3 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
          )}
          <span className="font-medium text-foreground/90">
            {seqLabel} ·{' '}
            {variant === 'pending'
              ? formatAbsolute(followup.scheduledAtIso)
              : `enviado ${formatAbsolute(followup.sentAt ?? followup.scheduledAtIso)}`}
          </span>
          {variant === 'pending' && remainingMs > 0 ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              en {formatRelativeShort(remainingMs)}
            </span>
          ) : null}
          {followup.aiPersonalize ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-3.5 text-[8px] px-1 font-normal text-amber-500 border-amber-500/40 cursor-help"
                  >
                    <Sparkles className="size-2 mr-0.5" />
                    Personalizado
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Generado por IA (Haiku 4.5) con el contexto actual de la conversación
                  + el nombre del lead. Si la conversación cambió y quieres un mensaje
                  fresco, pulsa <strong>Regenerar</strong>.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge
              variant="outline"
              className="h-3.5 text-[8px] px-1 font-normal text-muted-foreground border-border"
            >
              <Pin className="size-2 mr-0.5" />
              Mensaje fijo
            </Badge>
          )}
        </div>
      </div>

      {followup.body ? (
        <div className="rounded bg-background/40 border border-border/30 px-2 py-1.5 text-[11px] leading-snug whitespace-pre-wrap text-foreground/85">
          {followup.body}
        </div>
      ) : followup.aiPersonalize && variant === 'pending' ? (
        <p className="text-amber-500/80 italic text-[11px] leading-snug">
          Generando mensaje con IA…  Si tarda, se reintentará al enviar usando
          los últimos mensajes de la conversación.
        </p>
      ) : null}

      {variant === 'pending' && canManage ? (
        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
          <Button
            size="sm"
            variant="default"
            onClick={onSendNow}
            disabled={isPending}
            className="h-6 text-[10px] px-2"
          >
            <Send className="size-2.5 mr-1" />
            Enviar ya
          </Button>
          {followup.aiPersonalize ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRegenerate}
              disabled={isPending}
              className="h-6 text-[10px] px-2"
              title="Regenerar el mensaje con el contexto actual de la conversación"
            >
              <RefreshCw className={cn('size-2.5 mr-1', isPending && 'animate-spin')} />
              Regenerar
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-rose-500"
          >
            <X className="size-2.5 mr-1" />
            Cancelar
          </Button>
        </div>
      ) : null}

      {variant === 'pending' && followup.status === 'failed' ? (
        <div className="flex items-center gap-1 text-[10px] text-rose-500">
          <AlertCircle className="size-2.5" />
          {followup.lastError ?? 'falló'}
        </div>
      ) : null}
    </div>
  );
}
