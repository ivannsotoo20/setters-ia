import { Phone, Mail, AtSign, Calendar, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center text-base font-medium uppercase">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold truncate leading-tight">{name}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {formatChannelLong(detail.channel)}
          </p>
        </div>
      </CardHeader>
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
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <FollowCard label="Te sigue" />
          <FollowCard label="Le sigues" />
        </div>
      </CardContent>
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

function FollowCard({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border bg-muted/20 p-2 cursor-help">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-normal">
              —
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>Próximamente Sprint Mu (Meta API directo)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
