'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface Props {
  q: string;
  channel: 'all' | 'wa' | 'ig';
  unread: boolean;
  mine: boolean;
}

export function ConversationListFilters({ q, channel, unread, mine }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState(q);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam('q', value.length > 0 ? value : null);
    }, 250);
  };

  const toggleChannel = (next: 'all' | 'wa' | 'ig') => {
    setParam('channel', next === 'all' ? null : next);
  };

  const toggleFlag = (key: 'unread' | 'mine', current: boolean) => {
    setParam(key, current ? null : '1');
  };

  return (
    <div className="flex flex-col gap-2 p-2 border-b border-border">
      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar nombre, usuario o teléfono…"
          className="pl-8 h-8 text-sm"
        />
        {searchValue.length > 0 ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          label="Todos"
          active={channel === 'all'}
          onClick={() => toggleChannel('all')}
        />
        <FilterChip label="WA" active={channel === 'wa'} onClick={() => toggleChannel('wa')} />
        <FilterChip label="IG" active={channel === 'ig'} onClick={() => toggleChannel('ig')} />
        <span className="w-px h-3 bg-border mx-0.5" aria-hidden />
        <FilterChip
          label="No leídos"
          active={unread}
          onClick={() => toggleFlag('unread', unread)}
        />
        <FilterChip
          label="Asignados a mí"
          active={mine}
          onClick={() => toggleFlag('mine', mine)}
        />
      </div>
    </div>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-6 rounded-full px-2.5 text-[11px] font-medium border transition-colors',
        active
          ? 'border-primary/60 bg-primary/15 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {label}
    </button>
  );
}
