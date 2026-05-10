import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getContactDetail } from '@/lib/actions/contacts';
import { listLabels } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import { ContactDetail } from '@/components/contacts/contact-detail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) notFound();

  const effective = await getEffectiveTenant();
  if (!effective) notFound();

  const [detailRes, labelsRes, membersRes] = await Promise.all([
    getContactDetail(num),
    listLabels(),
    listMembers({ tenantId: effective.tenantId }),
  ]);

  if (!detailRes.ok || !detailRes.data) notFound();

  const allLabels = labelsRes.ok ? (labelsRes.data ?? []) : [];
  const members = membersRes.ok ? (membersRes.data ?? []) : [];
  const canWrite =
    effective.isAgencyAdmin ||
    effective.role === 'owner' ||
    effective.role === 'admin';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <header className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/contacts">
            <ArrowLeft className="size-3.5" />
            Contactos
          </Link>
        </Button>
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="text-sm text-muted-foreground">ID #{detailRes.data.lead.id}</span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <ContactDetail
            lead={detailRes.data.lead}
            events={detailRes.data.events}
            notes={detailRes.data.notes}
            allLabels={allLabels}
            members={members}
            viewerId={effective.userId}
            canWrite={canWrite}
            showOpenInPage={false}
          />
        </div>
      </div>
    </div>
  );
}
