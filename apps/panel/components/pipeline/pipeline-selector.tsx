'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MessageCircle, MessageSquare, Camera, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINE_LABELS, type PipelineKey } from '@/lib/pipeline-constants';

interface Props {
  active: PipelineKey;
}

const ITEMS: Array<{ key: PipelineKey; icon: React.ComponentType<{ className?: string }>; suffix?: React.ReactNode }> = [
  { key: 'wa', icon: MessageCircle },
  { key: 'fb', icon: MessageSquare },
  { key: 'ig-in', icon: Camera, suffix: <ArrowDownToLine className="size-3" /> },
  { key: 'ig-out', icon: Camera, suffix: <ArrowUpFromLine className="size-3" /> },
];

export function PipelineSelector({ active }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  function onSelect(key: PipelineKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('p', key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    try {
      window.localStorage.setItem('pipeline:lastKey', key);
    } catch {
      // Ignore localStorage errors (private mode, etc.)
    }
  }

  return (
    <div role="tablist" className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-1">
      {ITEMS.map(({ key, icon: Icon, suffix }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              isActive
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Icon className="size-3.5" />
            {PIPELINE_LABELS[key].replace('Instagram · ', 'IG ')}
            {suffix}
          </button>
        );
      })}
    </div>
  );
}
