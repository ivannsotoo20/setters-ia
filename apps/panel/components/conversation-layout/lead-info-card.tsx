'use client';

import { Phone, Mail, AtSign, Calendar, Hash, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  formatLeadName,
  leadInitials,
  formatChannelLong,
  formatAbsoluteShort,
} from './format-helpers';
import type { SelectedConversationDetail } from './types';

interface Props {
  detail: SelectedConversationDetail;
}

export function LeadInfoCard({ detail }: Props) {
  const lead = detail.lead;
  const name = formatLeadName(lead);
  const initials = leadInitials(lead);

  return (
    <Card>
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/coll-trig w-full text-left rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={`Información del lead ${name}`}
          >
            <CardHeader className="flex-row items-center gap-3 space-y-0 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-xl">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-semibold uppercase shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold truncate leading-tight">{name}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {formatChannelLong(detail.channel)}
                </p>
              </div>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/coll-trig:rotate-180" />
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0">
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-1 gap-2">
              {lead.username ? (
                <DataRow icon={AtSign} label="Usuario" value={`@${lead.username}`} />
              ) : null}
              <DataRow icon={Hash} label="ID externo" value={lead.external_id} mono />
              {lead.phone ? <DataRow icon={Phone} label="Teléfono" value={lead.phone} /> : null}
              {lead.email ? <DataRow icon={Mail} label="Email" value={lead.email} /> : null}
              <DataRow
                icon={Calendar}
                label="Creada"
                value={formatAbsoluteShort(detail.createdAt)}
              />
            </dl>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </dt>
      <dd className={`ml-auto truncate min-w-0 text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
