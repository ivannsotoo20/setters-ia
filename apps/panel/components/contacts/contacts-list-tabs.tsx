'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  type LeadTabKey,
  type LeadTabCounts,
} from '@/lib/lead-list-query';

interface Props {
  active: LeadTabKey;
  counts: LeadTabCounts;
}

const TABS: { key: LeadTabKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'hot', label: 'Hot Lead' },
  { key: 'bought', label: 'Comprados' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'lost', label: 'Perdidos' },
];

/**
 * Sprint Mu — Tabs derivados del estado final del lead. Contadores
 * agregados sobre el conjunto de conversations de cada lead (precedencia
 * bought > lost > cancelled > hot > active > all).
 */
export function ContactsListTabs({ active, counts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const setTab = (key: LeadTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <nav className="flex flex-wrap gap-1 px-3 py-2 border-b border-border bg-card/40">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'h-7 rounded-full px-3 text-[12px] font-medium border transition-colors flex items-center gap-1.5',
              isActive
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                'tabular-nums text-[10px] px-1.5 rounded-full',
                isActive ? 'bg-primary/20' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
