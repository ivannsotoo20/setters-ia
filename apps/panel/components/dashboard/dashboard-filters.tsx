'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MessageCircle, MessageSquare, Camera, ArrowDownToLine, ArrowUpFromLine, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { ChannelFilter } from '@/lib/actions/dashboard';
import type { WindowKey } from '@/lib/pipeline-window';

interface Props {
  active: ChannelFilter;
  windowKey: WindowKey;
  fromIso: string;
  toIso: string;
}

const CHANNELS: Array<{
  key: ChannelFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  suffix?: React.ReactNode;
}> = [
  { key: 'all', label: 'Todos', icon: Layers },
  { key: 'wa', label: 'WhatsApp', icon: MessageCircle },
  { key: 'fb', label: 'Facebook', icon: MessageSquare },
  { key: 'ig-in', label: 'IG in', icon: Camera, suffix: <ArrowDownToLine className="size-3" /> },
  { key: 'ig-out', label: 'IG out', icon: Camera, suffix: <ArrowUpFromLine className="size-3" /> },
];

const WINDOW_OPTIONS: Array<{ value: WindowKey; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes anterior' },
  { value: 'custom', label: 'Personalizado' },
];

export function DashboardFilters({ active, windowKey, fromIso, toIso }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div role="tablist" className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-1">
        {CHANNELS.map(({ key, label, icon: Icon, suffix }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setParam('ch', key === 'all' ? null : key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                isActive
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {suffix}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <Select value={windowKey} onValueChange={(v) => setParam('w', v)}>
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {windowKey === 'custom' ? (
        <>
          <Input
            type="date"
            value={fromIso ? fromIso.slice(0, 10) : ''}
            onChange={(e) => setParam('from', e.target.value || null)}
            className="h-8 w-[140px] text-xs"
            aria-label="Desde"
          />
          <Input
            type="date"
            value={toIso ? toIso.slice(0, 10) : ''}
            onChange={(e) => setParam('to', e.target.value || null)}
            className="h-8 w-[140px] text-xs"
            aria-label="Hasta"
          />
        </>
      ) : null}
    </div>
  );
}
