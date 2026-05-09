import { notFound } from 'next/navigation';
import { ConversationLayout } from '@/components/conversation-layout/conversation-layout';
import {
  parseTab,
  parseChannel,
  parseBoolFlag,
} from '@/lib/conversation-list-query';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    channel?: string;
    unread?: string;
    mine?: string;
  }>;
}

/**
 * Deep-link directo al chat: renderiza el mismo `<ConversationLayout>` que
 * `/conversations`, con `selectedId` forzado al param. URL canónica
 * preservada (no usamos redirect → back button limpio).
 */
export default async function ConversationDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const selectedNum = Number(id);
  if (!Number.isFinite(selectedNum) || selectedNum <= 0) notFound();

  return (
    <ConversationLayout
      selectedId={selectedNum}
      activeTab={parseTab(sp.tab)}
      filters={{
        q: sp.q ?? '',
        channel: parseChannel(sp.channel),
        unread: parseBoolFlag(sp.unread),
        mine: parseBoolFlag(sp.mine),
      }}
    />
  );
}
