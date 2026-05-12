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

// Sprint Iota.3 hotfix — patrón simplificado: el aside hace su propio
// `h-full + overflow-y-auto` directamente. El wrapper anterior (`relative`
// + `absolute inset-0`) era frágil porque dependía de que el grid cell padre
// propagase altura concreta vía `h-full`, y en flex-column eso falla.
// Ahora el aside es el scroll container directo. Requiere que el padre tenga
// altura definida (lo garantiza `conversation-shell.tsx` con `h-full
// overflow-hidden` en cada celda).
const ASIDE_BASE =
  'h-full w-full overflow-y-auto flex flex-col gap-4 p-4 pb-8 border-l border-border bg-card/30 ' +
  '[scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 ' +
  '[&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full ' +
  '[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60';

export function ControlPanel({
  detail,
  followups,
  followupConfig,
  canManageFollowups,
  lastLeadMessageAt,
}: Props) {
  if (!detail) {
    return (
      <aside
        className={`${ASIDE_BASE} items-center justify-center text-center text-sm text-muted-foreground`}
        aria-label="Panel de control"
      >
        <p>Selecciona una conversación para ver el panel de control.</p>
      </aside>
    );
  }

  return (
    <aside className={ASIDE_BASE} aria-label="Panel de control">
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
  );
}
