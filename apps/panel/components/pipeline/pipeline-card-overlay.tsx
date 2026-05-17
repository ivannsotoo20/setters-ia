'use client';

import { motion } from 'motion/react';
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

/**
 * Overlay del card mientras se arrastra. Lo renderiza `<DragOverlay>` de
 * @dnd-kit, fuera del flujo normal. Animamos con motion + spring para dar
 * sensación física de "agarrar" — escala hacia arriba + rotación sutil que
 * inicializa desde el estado de reposo y descansa en el destino vía spring
 * (mucho más natural que un scale CSS estático).
 */
export function PipelineCardOverlay({ card }: Props) {
  const lead = card.lead;
  const channel = card.channel;
  return (
    <motion.div
      initial={{ scale: 1, rotate: 0 }}
      animate={{ scale: 1.04, rotate: -1.5 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.6 }}
      className="rounded-lg border-2 border-primary/60 bg-card p-2.5 shadow-2xl shadow-primary/25 ring-4 ring-primary/15 w-[260px] cursor-grabbing"
    >
      <div className="flex gap-2.5 items-start min-w-0">
        <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold uppercase shrink-0">
          {leadInitials(lead)}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="truncate text-xs font-semibold text-foreground">{formatLeadName(lead)}</span>
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
    </motion.div>
  );
}
