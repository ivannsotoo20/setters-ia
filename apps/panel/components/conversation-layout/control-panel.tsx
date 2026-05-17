import { LeadInfoCard } from './lead-info-card';
import { FunnelPhaseIndicator } from './funnel-phase-indicator';
import { AIControlPanel } from './ai-control-panel';
import type { SelectedConversationDetail, TimelineMessage } from './types';
import type { ScheduledFollowupRow } from '@/lib/actions/followups';
import type { TenantFollowupConfigRow } from '@/lib/actions/followup-config';

interface Props {
  detail: SelectedConversationDetail | null;
  /** Mensajes ya cargados por `ConversationLayout` — los reusamos para derivar
   * "Hechos de la conversación" en el panel sin extra round-trip a BD. */
  messages: TimelineMessage[];
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
//
// Iteración 2026-05-16: scrollbar más visible (3px → 8px en hover) y color
// más fuerte. Antes era 2px con muted-foreground/40 — pasaba desapercibido
// y daba sensación de que el panel no se podía scrollear.
// `overscroll-contain` evita que el scroll del aside propague al body cuando
// se llega al final.
const ASIDE_BASE =
  'h-full w-full overflow-y-auto overscroll-contain flex flex-col gap-4 p-4 pb-12 border-l border-border bg-card/30 ' +
  '[scrollbar-gutter:stable] ' +
  '[&::-webkit-scrollbar]:w-2 hover:[&::-webkit-scrollbar]:w-2.5 ' +
  '[&::-webkit-scrollbar-track]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/60 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full ' +
  '[&::-webkit-scrollbar-thumb:hover]:bg-foreground/70 ' +
  '[scrollbar-width:thin] [scrollbar-color:var(--muted-foreground)_transparent]';

export function ControlPanel({
  detail,
  messages,
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
      <FunnelPhaseIndicator detail={detail} messages={messages} />
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
