'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import {
  type LeadListRow,
  type LeadFilterParams,
  type LeadTabKey,
  rowsForTab,
  leadTabCounts,
} from '@/lib/lead-list-query';
import {
  listContactsPage,
  type CursorParam,
} from '@/lib/actions/contacts';
import { ContactsListTabs } from './contacts-list-tabs';
import { ContactsListItem } from './contacts-list-item';

interface Props {
  initialRows: LeadListRow[];
  initialNextCursor: CursorParam | null;
  initialHasMore: boolean;
  selectedId: number | null;
  activeTab: LeadTabKey;
  filters: LeadFilterParams;
  assigneeMap: Record<string, string>;
  pageSize: number;
}

/**
 * Sprint Mu.2 — Pane principal escalable. Mantiene state client-side de
 * todas las páginas cargadas. Cuando cambian filtros/tab → server re-renders
 * la primera página y el useEffect re-sincroniza state. Load-more con
 * IntersectionObserver al final del listado.
 */
export function ContactsListPane({
  initialRows,
  initialNextCursor,
  initialHasMore,
  selectedId,
  activeTab,
  filters,
  assigneeMap,
  pageSize,
}: Props) {
  const [rows, setRows] = useState<LeadListRow[]>(initialRows);
  const [cursor, setCursor] = useState<CursorParam | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoading, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  // Re-sincroniza state cuando el server entrega una primera página nueva
  // (después de cambio de filtros/tab — searchParams cambia y server
  // re-renderiza con nuevos initial*).
  useEffect(() => {
    setRows(initialRows);
    setCursor(initialNextCursor);
    setHasMore(initialHasMore);
    setLoadError(null);
  }, [initialRows, initialNextCursor, initialHasMore]);

  // IntersectionObserver para auto-load cuando el sentinel entra en viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || isLoading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoading, cursor]);

  const loadMore = () => {
    if (!cursor || !hasMore || isLoading) return;
    startTransition(async () => {
      const res = await listContactsPage({
        filters,
        cursor,
        limit: pageSize,
      });
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      const newRows = res.data?.rows ?? [];
      const newCursor = res.data?.nextCursor ?? null;
      const more = res.data?.hasMore ?? false;
      setRows((prev) => {
        // Evita duplicados si por alguna razón viene un row repetido.
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of newRows) if (!seen.has(r.id)) merged.push(r);
        return merged;
      });
      setCursor(newCursor);
      setHasMore(more);
    });
  };

  const counts = useMemo(() => leadTabCounts(rows), [rows]);
  const visible = useMemo(
    () => rowsForTab(rows, activeTab, filters),
    [rows, activeTab, filters],
  );

  return (
    <section
      className="flex-1 min-w-0 flex flex-col h-full min-h-0 bg-background"
      aria-label="Lista de contactos"
    >
      <header className="border-b border-border px-4 py-3 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-base font-heading font-semibold tracking-tight">Contactos</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {rows.length} cargados · {visible.length} en vista
            {hasMore ? ' · más disponibles' : ''}
          </p>
        </div>
      </header>
      <div className="shrink-0">
        <ContactsListTabs active={activeTab} counts={counts} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 px-6 text-center text-sm text-muted-foreground">
            <Inbox className="size-8 opacity-40" />
            <p>Sin contactos en esta vista.</p>
            {rows.length === 0 ? (
              <p className="text-xs">
                Cuando llegue el primer lead vía IG / WhatsApp aparecerá aquí.
              </p>
            ) : (
              <p className="text-xs">Prueba a limpiar filtros o cambiar de pestaña.</p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((row) => {
              const summary = row.conversations.find((c) => c.assigned_user_id != null);
              const assigneeId = summary?.assigned_user_id ?? null;
              return (
                <ContactsListItem
                  key={row.id}
                  row={row}
                  isSelected={row.id === selectedId}
                  assigneeLabel={assigneeId ? (assigneeMap[assigneeId] ?? null) : null}
                />
              );
            })}
          </ul>
        )}

        {/* Sentinel para infinite scroll. Solo si hay más + estamos en vista. */}
        {hasMore ? (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-4 text-xs text-muted-foreground"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Cargando más…
              </span>
            ) : (
              <span>Desliza para cargar más</span>
            )}
          </div>
        ) : rows.length > 0 ? (
          <div className="flex items-center justify-center py-4 text-[10px] text-muted-foreground italic">
            Has llegado al final
          </div>
        ) : null}

        {loadError ? (
          <div className="px-4 py-3 text-xs text-destructive">
            Error cargando más: {loadError}
          </div>
        ) : null}
      </div>
    </section>
  );
}
