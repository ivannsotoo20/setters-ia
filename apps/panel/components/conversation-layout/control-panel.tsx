import { LeadInfoCard } from './lead-info-card';
import { FunnelPhaseIndicator } from './funnel-phase-indicator';
import { AIControlPanel } from './ai-control-panel';
import type { SelectedConversationDetail } from './types';
import type { ScheduledFollowupRow } from '@/lib/actions/followups';
import type { TenantFollowupConfigRow } from '@/lib/actions/followup-config';

interface Props {
  detail: SelectedConversationDetail | null;
  followups: ScheduledFollowupRow[];
  followupConfig: TenantFollowupConfigRow;
  canManageFollowups: boolean;
  lastLeadMessageAt: string | null;
}

export function ControlPanel({
  detail,
  followups,
  followupConfig,
  canManageFollowups,
  lastLeadMessageAt,
}: Props) {
  if (!detail) {
    return (
      <div className="relative h-full w-full hidden lg:block">
        <aside
          className="absolute inset-0 flex flex-col gap-4 p-4 border-l border-border bg-card/30 overflow-y-auto items-center justify-center text-center text-sm text-muted-foreground"
          aria-label="Panel de control"
        >
          <p>Selecciona una conversación para ver el panel de control.</p>
        </aside>
      </div>
    );
  }

  // Sprint Iota.2 — wrapper relative + aside absolute inset-0 fuerza altura
  // concreta y scroll robusto en cualquier viewport (mobile/tablet/desktop).
  // Antes con flex/grid sólo a veces el aside expandía con el contenido.
  return (
    <div className="relative h-full w-full">
      <aside
        className="absolute inset-0 flex flex-col gap-4 p-4 pb-8 border-l border-border bg-card/30 overflow-y-auto [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60"
        aria-label="Panel de control"
      >
        <LeadInfoCard detail={detail} />
        <FunnelPhaseIndicator detail={detail} />
        <AIControlPanel
          detail={detail}
          followups={followups}
          followupConfig={followupConfig}
          canManageFollowups={canManageFollowups}
          lastLeadMessageAt={lastLeadMessageAt}
        />
      </aside>
    </div>
  );
}
