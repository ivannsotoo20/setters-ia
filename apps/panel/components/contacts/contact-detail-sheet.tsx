'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { LeadListRow } from '@/lib/lead-list-query';
import type { ContactPipelineEvent, ContactNote } from '@/lib/actions/contacts';
import type { LabelRow } from '@/lib/actions/labels';
import type { MemberRow } from '@/lib/actions/members';
import { ContactDetail } from './contact-detail';

interface Props {
  detail: {
    lead: LeadListRow;
    events: ContactPipelineEvent[];
    notes: ContactNote[];
  } | null;
  allLabels: LabelRow[];
  members: MemberRow[];
  viewerId: string;
  canWrite: boolean;
}

export function ContactDetailSheet({ detail, allLabels, members, viewerId, canWrite }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const onOpenChange = (open: boolean) => {
    if (open) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Sheet open={detail != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Detalle del contacto</SheetTitle>
          <SheetDescription>
            Datos del contacto, etiquetas activas, histórico de conversaciones y eventos del
            pipeline.
          </SheetDescription>
        </SheetHeader>
        {detail ? (
          <ContactDetail
            lead={detail.lead}
            events={detail.events}
            notes={detail.notes}
            allLabels={allLabels}
            members={members}
            viewerId={viewerId}
            canWrite={canWrite}
            showOpenInPage
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
