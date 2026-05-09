import { Inbox } from 'lucide-react';
import {
  type ConversationListRow,
  type FilterParams,
  type TabKey,
  rowsForTab,
  tabCounts,
} from '@/lib/conversation-list-query';
import { ConversationListItem } from './conversation-list-item';
import { ConversationListTabs } from './conversation-list-tabs';
import { ConversationListFilters } from './conversation-list-filters';

interface Props {
  rows: ConversationListRow[];
  selectedId: number | null;
  activeTab: TabKey;
  filters: FilterParams;
  assigneeMap: Record<string, string>;
}

export function ConversationListPane({
  rows,
  selectedId,
  activeTab,
  filters,
  assigneeMap,
}: Props) {
  const counts = tabCounts(rows);
  const visible = rowsForTab(rows, activeTab, filters);

  return (
    <aside
      className="flex flex-col h-full bg-card/40 border-r border-border min-w-0"
      aria-label="Lista de conversaciones"
    >
      <header className="border-b border-border px-3 py-2.5 shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">Conversaciones</h2>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {rows.length} totales · {visible.length} en vista
        </p>
      </header>
      <ConversationListFilters
        q={filters.q ?? ''}
        channel={filters.channel ?? 'all'}
        unread={filters.unread === true}
        mine={filters.mine === true}
      />
      <ConversationListTabs active={activeTab} counts={counts} />
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center text-sm text-muted-foreground">
            <Inbox className="size-7 opacity-40" />
            <p>Sin conversaciones en esta vista.</p>
            {rows.length === 0 ? (
              <p className="text-xs">
                Cuando llegue el primer lead vía IG / WhatsApp aparecerá aquí.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((row) => (
              <ConversationListItem
                key={row.id}
                row={row}
                isSelected={row.id === selectedId}
                assigneeLabel={
                  row.assigned_user_id ? assigneeMap[row.assigned_user_id] ?? null : null
                }
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
