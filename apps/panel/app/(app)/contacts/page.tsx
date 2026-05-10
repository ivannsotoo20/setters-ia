import { ContactsLayout } from '@/components/contacts/contacts-layout';
import {
  parseLeadTab,
  parseCsvIntList,
  parseCsvStringList,
  parseQualified,
  parseAiState,
  parseTriState,
  type LeadFilterParams,
} from '@/lib/lead-list-query';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    selected?: string;
    tab?: string;
    q?: string;
    channels?: string;
    providers?: string;
    triggers?: string;
    phases?: string;
    states?: string;
    qualified?: string;
    handoff?: string;
    labels?: string;
    assignee?: string;
    createdW?: string;
    createdFrom?: string;
    createdTo?: string;
    lastMsgW?: string;
    lastMsgFrom?: string;
    lastMsgTo?: string;
    aiState?: string;
    blocked?: string;
    scheduled?: string;
  }>;
}

export default async function ContactsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const selectedRaw = sp.selected;
  const selectedNum = selectedRaw ? Number(selectedRaw) : NaN;
  const selectedId =
    Number.isFinite(selectedNum) && selectedNum > 0 ? selectedNum : null;

  // Reconstrucción de fechas: si hay preset (createdW='7d') sin createdFrom/To,
  // el filter pane se encarga de setearlos. Aquí solo leemos los ISO ya
  // resueltos en URL (`createdFrom`, `createdTo`, etc.).
  const filters: LeadFilterParams = {
    q: sp.q ?? '',
    channels: parseCsvStringList(sp.channels),
    providers: parseCsvStringList(sp.providers),
    triggers: parseCsvStringList(sp.triggers),
    phases: parseCsvIntList(sp.phases),
    states: parseCsvStringList(sp.states),
    qualified: parseQualified(sp.qualified),
    handoffCauses: parseCsvStringList(sp.handoff),
    labelIds: parseCsvIntList(sp.labels),
    assignee: sp.assignee ?? 'any',
    createdFrom: sp.createdFrom ?? null,
    createdTo: sp.createdTo ?? null,
    lastMsgFrom: sp.lastMsgFrom ?? null,
    lastMsgTo: sp.lastMsgTo ?? null,
    lastMsgNever: sp.lastMsgW === 'never',
    aiState: parseAiState(sp.aiState),
    blocked: parseTriState(sp.blocked),
    scheduled: parseTriState(sp.scheduled),
  };

  return (
    <ContactsLayout
      selectedId={selectedId}
      activeTab={parseLeadTab(sp.tab)}
      filters={filters}
    />
  );
}
