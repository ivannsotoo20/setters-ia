'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { TabKey } from '@/lib/conversation-list-query';

interface Props {
  active: TabKey;
  counts: Record<TabKey, number>;
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'chats', label: 'Chats' },
  { key: 'hot', label: 'Hot' },
  { key: 'done', label: 'Completados' },
  { key: 'bought', label: 'Comprados' },
];

export function ConversationListTabs({ active, counts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const onChange = (next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'chats') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div role="tablist" className="flex items-center gap-1 px-2 border-b border-border">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                'tabular-nums rounded-sm px-1 text-[10px] min-w-4 text-center',
                isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
