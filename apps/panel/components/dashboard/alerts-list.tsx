'use client';

import { AlertCircle, AlertTriangle, Info as InfoIcon, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alert, AlertSeverity } from '@/lib/dashboard-alerts';

interface Props {
  alerts: Alert[];
}

const SEVERITY_STYLES: Record<AlertSeverity, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/5 border-rose-500/30' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/30' },
  info: { icon: InfoIcon, color: 'text-sky-500', bg: 'bg-sky-500/5 border-sky-500/20' },
};

export function AlertsList({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <TrendingUp className="size-3" />
        Señales de alerta · {alerts.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {alerts.map((alert) => {
          const Icon = SEVERITY_STYLES[alert.severity].icon;
          return (
            <div
              key={alert.id}
              className={cn(
                'rounded-md border px-2.5 py-1.5 flex items-start gap-2 text-xs',
                SEVERITY_STYLES[alert.severity].bg,
              )}
            >
              <Icon className={cn('size-3.5 shrink-0 mt-0.5', SEVERITY_STYLES[alert.severity].color)} />
              <span className="flex-1">{alert.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
