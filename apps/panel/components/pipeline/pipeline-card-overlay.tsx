'use client';

import { Badge } from '@/components/ui/badge';
import {
  formatLeadName,
  leadInitials,
  formatChannelShort,
} from '@/components/conversation-layout/format-helpers';
import type { PipelineCard as PipelineCardData } from '@/lib/pipeline-query';

interface Props {
  card: PipelineCardData;
}

export function PipelineCardOverlay({ card }: Props) {
  const lead = card.lead;
  const channel = card.channel;
  return (
    <div className="rounded-md border border-primary/50 bg-card p-2.5 shadow-lg ring-2 ring-primary/30 w-[260px] cursor-grabbing">
      <div className="flex gap-2 items-start min-w-0">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium uppercase shrink-0">
          {leadInitials(lead)}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="truncate text-xs font-medium">{formatLeadName(lead)}</span>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal">
              {formatChannelShort(channel)}
            </Badge>
            <Badge variant="secondary" className="h-3.5 text-[8px] px-1 font-mono">
              F{card.phaseNumber}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
