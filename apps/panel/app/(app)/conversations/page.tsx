import { ConversationLayout } from '@/components/conversation-layout/conversation-layout';
import {
  parseTab,
  parseChannel,
  parseBoolFlag,
  parseLabelIds,
} from '@/lib/conversation-list-query';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    selected?: string;
    tab?: string;
    q?: string;
    channel?: string;
    unread?: string;
    mine?: string;
    labels?: string;
  }>;
}

export default async function ConversationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const selectedRaw = sp.selected;
  const selectedNum = selectedRaw ? Number(selectedRaw) : NaN;
  const selectedId =
    Number.isFinite(selectedNum) && selectedNum > 0 ? selectedNum : null;

  return (
    <ConversationLayout
      selectedId={selectedId}
      activeTab={parseTab(sp.tab)}
      filters={{
        q: sp.q ?? '',
        channel: parseChannel(sp.channel),
        unread: parseBoolFlag(sp.unread),
        mine: parseBoolFlag(sp.mine),
        labelIds: parseLabelIds(sp.labels),
      }}
    />
  );
}
