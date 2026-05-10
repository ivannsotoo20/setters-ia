'use client';

import { useState, useEffect, useTransition } from 'react';
import { Clock, X, AlertCircle, CheckCircle2, Sparkles, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  cancelScheduledFollowup,
  type ScheduledFollowupRow,
} from '@/lib/actions/followups';

interface Props {
  followups: ScheduledFollowupRow[];
  canCancel: boolean;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'enviando…';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (day > 0) return `en ${day}d ${hour % 24}h`;
  if (hour > 0) return `en ${hour}h ${min % 60}m`;
  if (min > 0) return `en ${min}m ${sec % 60}s`;
  return `en ${sec}s`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScheduledFollowupsList({ followups, canCancel }: Props) {
  const visible = followups.filter((f) => {
    if (f.status === 'pending' || f.status === 'processing' || f.status === 'failed') return true;
    if (f.status === 'sent' || f.status === 'cancelled') {
      const ageMs = Date.now() - Date.parse(f.sentAt ?? f.createdAt);
      return ageMs < 7 * 86400000;
    }
    return false;
  });

  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">Sin seguimientos programados.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((f) => (
        <FollowupRow key={f.id} followup={f} canCancel={canCancel} />
      ))}
    </div>
  );
}

function FollowupRow({
  followup,
  canCancel,
}: {
  followup: ScheduledFollowupRow;
  canCancel: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const isPendingStatus = followup.status === 'pending' || followup.status === 'processing';

  useEffect(() => {
    if (!isPendingStatus) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isPendingStatus]);

  const scheduledMs = Date.parse(followup.scheduledAtIso);
  const remainingMs = scheduledMs - now;

  function onCancel() {
    if (!confirm('¿Cancelar este followup programado?')) return;
    startTransition(async () => {
      const r = await cancelScheduledFollowup(followup.id);
      if (!r.ok) toast.error(r.error);
      else toast.success('Followup cancelado');
    });
  }

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2 text-xs flex flex-col gap-1.5',
        isPendingStatus && 'border-amber-500/30 bg-amber-500/5',
        followup.status === 'sent' && 'border-emerald-500/30 bg-emerald-500/5',
        followup.status === 'cancelled' && 'border-border/40 bg-muted/20',
        followup.status === 'failed' && 'border-rose-500/40 bg-rose-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {isPendingStatus ? (
            <Clock className="size-3 text-amber-500 shrink-0" />
          ) : followup.status === 'sent' ? (
            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
          ) : followup.status === 'cancelled' ? (
            <X className="size-3 text-muted-foreground shrink-0" />
          ) : (
            <AlertCircle className="size-3 text-rose-500 shrink-0" />
          )}
          <span className="font-medium text-foreground/90">
            {isPendingStatus
              ? formatCountdown(remainingMs)
              : followup.status === 'sent'
                ? `enviado ${formatAbsolute(followup.sentAt ?? followup.scheduledAtIso)}`
                : followup.status === 'cancelled'
                  ? 'cancelado'
                  : 'falló'}
          </span>
          {followup.triggeredBy === 'auto_inactivity' ? (
            <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal text-sky-500 border-sky-500/40">
              <Bot className="size-2 mr-0.5" />
              auto #{followup.sequenceIndex}
            </Badge>
          ) : null}
          {followup.aiPersonalize ? (
            <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal text-amber-500 border-amber-500/40">
              <Sparkles className="size-2 mr-0.5" />
              AI
            </Badge>
          ) : null}
          {followup.templateName ? (
            <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal">
              {followup.templateName}
            </Badge>
          ) : null}
        </div>
        {canCancel && isPendingStatus ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="text-muted-foreground hover:text-rose-500 transition-colors p-0.5"
            aria-label="Cancelar followup"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      {followup.aiPersonalize && isPendingStatus ? (
        <p className="text-amber-500/80 italic text-[11px] line-clamp-2">
          Mensaje contextual: el motor lo generará al enviar siguiendo "{followup.aiGuide}"
        </p>
      ) : followup.body ? (
        <p className="text-foreground/80 line-clamp-3 leading-snug">{followup.body}</p>
      ) : null}
      <p className="text-[10px] text-muted-foreground tabular-nums">
        {isPendingStatus ? `programado para ${formatAbsolute(followup.scheduledAtIso)}` : null}
        {followup.status === 'cancelled' && followup.lastError ? (
          <span className="italic">{followup.lastError}</span>
        ) : null}
        {followup.status === 'failed' && followup.lastError ? (
          <span className="italic text-rose-500">{followup.lastError}</span>
        ) : null}
      </p>
    </div>
  );
}
