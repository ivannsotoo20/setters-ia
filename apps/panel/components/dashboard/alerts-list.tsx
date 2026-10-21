'use client';

import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Info as InfoIcon,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alert, AlertSeverity } from '@/lib/dashboard-alerts';
import { MAX_FILTER_IDS } from '@/lib/conversation-list-query';

interface Props {
  alerts: Alert[];
}

const SEVERITY_STYLES: Record<
  AlertSeverity,
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  critical: {
    icon: AlertCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/8 border-destructive/30 dark:bg-destructive/15',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/8 border-warning/30 dark:bg-warning/15',
  },
  info: {
    icon: InfoIcon,
    color: 'text-primary',
    bg: 'bg-primary/8 border-primary/25 dark:bg-primary/15',
  },
};

export function AlertsList({ alerts }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
        <TrendingUp className="size-3" />
        Señales de alerta · {alerts.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {alerts.map((alert) => {
          const Icon = SEVERITY_STYLES[alert.severity].icon;
          const href = alertHref(alert);
          const className = cn(
            'rounded-lg border px-3 py-2 flex items-start gap-2.5 text-xs',
            SEVERITY_STYLES[alert.severity].bg,
            href && 'transition-colors hover:border-foreground/30',
          );
          const content = (
            <>
              <Icon
                className={cn(
                  'size-3.5 shrink-0 mt-0.5',
                  SEVERITY_STYLES[alert.severity].color,
                )}
              />
              <span className="flex-1 leading-relaxed">{alert.message}</span>
              {href ? (
                <span className="inline-flex items-center gap-0.5 shrink-0 font-medium text-muted-foreground">
                  Ver
                  <ChevronRight className="size-3" />
                </span>
              ) : null}
            </>
          );
          return href ? (
            <Link key={alert.id} href={href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={alert.id} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Las alertas que cuentan conversaciones concretas abren esa lista (2026-10-21,
 * Tania: "al pulsar en las alertas no me da acceso"). El resto siguen siendo texto.
 */
function alertHref(alert: Alert): string | null {
  const ids = alert.convIds ?? [];
  if (ids.length === 0) return null;
  if (alert.type !== 'awaiting_reply' && alert.type !== 'handoff_unattended') return null;
  return `/conversations?ids=${ids.slice(0, MAX_FILTER_IDS).join(',')}&alert=${alert.type}`;
}
