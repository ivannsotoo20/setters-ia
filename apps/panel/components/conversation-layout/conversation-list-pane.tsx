import { Inbox } from 'lucide-react';
import {
  type ConversationListRow,
  type FilterParams,
  applyFilters,
} from '@/lib/conversation-list-query';
import type { LabelRow } from '@/lib/actions/labels';
import { ConversationListItem } from './conversation-list-item';
import { ConversationListFilters } from './conversation-list-filters';

interface Props {
  rows: ConversationListRow[];
  selectedId: number | null;
  filters: FilterParams;
  assigneeMap: Record<string, string>;
  allLabels: LabelRow[];
}

export function ConversationListPane({
  rows,
  selectedId,
  filters,
  assigneeMap,
  allLabels,
}: Props) {
  // Lista única "Chats" sin tabs Hot/Completados/Comprados (decisión 2026-05-16).
  // Los filtros pills (canal, no leídos, asignados, etiquetas) y la búsqueda se
  // aplican directamente sobre el set completo.
  const visible = applyFilters(rows, filters);

  return (
    <aside
      className="flex flex-col h-full min-h-0 bg-card/40 border-r border-border min-w-0"
      aria-label="Lista de conversaciones"
    >
      <header className="border-b border-border px-3 py-2.5 shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">Conversaciones</h2>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {rows.length} totales · {visible.length} en vista
        </p>
      </header>
      <div className="shrink-0">
        <ConversationListFilters
          q={filters.q ?? ''}
          channel={filters.channel ?? 'all'}
          unread={filters.unread === true}
          mine={filters.mine === true}
          labelIds={filters.labelIds ?? []}
          allLabels={allLabels}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
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
