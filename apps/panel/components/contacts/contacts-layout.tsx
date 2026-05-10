import { notFound } from 'next/navigation';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import {
  listContactsPage,
  getContactDetail,
  type CursorParam,
} from '@/lib/actions/contacts';
import { listLabels, type LabelRow } from '@/lib/actions/labels';
import { listMembers, type MemberRow } from '@/lib/actions/members';
import type {
  LeadListRow,
  LeadFilterParams,
  LeadTabKey,
} from '@/lib/lead-list-query';
import { ContactsListFilters } from './contacts-list-filters';
import { ContactsListPane } from './contacts-list-pane';
import { ContactDetailSheet } from './contact-detail-sheet';

interface Props {
  selectedId: number | null;
  activeTab: LeadTabKey;
  filters: LeadFilterParams;
}

const PAGE_SIZE = 100;

/**
 * Sprint Mu.2 — Server orchestrator escalable. Usa listContactsPage
 * (server-side filtering + cursor pagination, default 100 rows). Pasa
 * primera página al client, que gestiona load-more con server action en
 * scroll.
 */
export async function ContactsLayout({ selectedId, activeTab, filters }: Props) {
  const effective = await getEffectiveTenant();
  if (!effective) notFound();

  const filtersWithViewer: LeadFilterParams = {
    ...filters,
    viewerId: effective.userId,
  };

  const [pageRes, labelsRes, membersRes, detailRes] = await Promise.all([
    listContactsPage({ filters: filtersWithViewer, cursor: null, limit: PAGE_SIZE }),
    listLabels(),
    listMembers({ tenantId: effective.tenantId }),
    selectedId
      ? getContactDetail(selectedId)
      : Promise.resolve({ ok: true as const, data: undefined }),
  ]);

  if (!pageRes.ok) {
    return (
      <div className="p-8 text-sm text-destructive">
        Error cargando contactos: {pageRes.error}
      </div>
    );
  }

  const initialRows: LeadListRow[] = pageRes.data?.rows ?? [];
  const initialNextCursor: CursorParam | null = pageRes.data?.nextCursor ?? null;
  const initialHasMore = pageRes.data?.hasMore ?? false;
  const allLabels: LabelRow[] = labelsRes.ok ? (labelsRes.data ?? []) : [];
  const members: MemberRow[] = membersRes.ok ? (membersRes.data ?? []) : [];
  const detail = detailRes.ok ? (detailRes.data ?? null) : null;

  if (selectedId && !detail) notFound();

  // Mapa de userId → display name (full_name o email).
  const assigneeMap: Record<string, string> = {};
  for (const m of members) {
    assigneeMap[m.userId] = m.fullName ?? m.email;
  }

  // Triggers únicos extraídos de la primera página (best-effort — para más
  // exhaustividad necesitaríamos query DISTINCT separada). Acepto la
  // limitación: si un trigger raro no aparece en primera página, el filtro
  // tampoco lo ofrece.
  const triggerSet = new Set<string>();
  for (const r of initialRows) {
    for (const c of r.conversations) {
      if (c.conversation_source && c.conversation_source.length > 0) {
        triggerSet.add(c.conversation_source);
      }
    }
  }
  const triggers = Array.from(triggerSet).sort();

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <ContactsListFilters
        filters={filtersWithViewer}
        allLabels={allLabels}
        members={members}
        triggers={triggers}
        viewerId={effective.userId}
      />
      <ContactsListPane
        initialRows={initialRows}
        initialNextCursor={initialNextCursor}
        initialHasMore={initialHasMore}
        selectedId={selectedId}
        activeTab={activeTab}
        filters={filtersWithViewer}
        assigneeMap={assigneeMap}
        pageSize={PAGE_SIZE}
      />
      <ContactDetailSheet
        detail={detail}
        allLabels={allLabels}
        members={members}
        viewerId={effective.userId}
        canWrite={
          effective.isAgencyAdmin ||
          effective.role === 'owner' ||
          effective.role === 'admin'
        }
      />
    </div>
  );
}
