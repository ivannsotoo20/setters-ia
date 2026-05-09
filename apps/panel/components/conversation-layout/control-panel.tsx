import { LeadInfoCard } from './lead-info-card';
import { FunnelPhaseIndicator } from './funnel-phase-indicator';
import { AIControlPanel } from './ai-control-panel';
import type { SelectedConversationDetail } from './types';

interface Props {
  detail: SelectedConversationDetail | null;
}

export function ControlPanel({ detail }: Props) {
  if (!detail) {
    return (
      <aside
        className="hidden lg:flex flex-col gap-4 p-4 border-l border-border bg-card/30 overflow-y-auto h-full items-center justify-center text-center text-sm text-muted-foreground"
        aria-label="Panel de control"
      >
        <p>Selecciona una conversación para ver el panel de control.</p>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col gap-4 p-4 border-l border-border bg-card/30 overflow-y-auto h-full"
      aria-label="Panel de control"
    >
      <LeadInfoCard detail={detail} />
      <FunnelPhaseIndicator detail={detail} />
      <AIControlPanel detail={detail} />
    </aside>
  );
}
