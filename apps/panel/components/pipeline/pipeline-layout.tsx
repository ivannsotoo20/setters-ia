import { PipelineSelector } from './pipeline-selector';
import { PipelineFilters } from './pipeline-filters';
import { PipelineBoard } from './pipeline-board';
import { PipelineEmpty } from './pipeline-empty';
import type { PipelineKey, ColumnKey } from '@/lib/pipeline-constants';
import type { PipelineCard } from '@/lib/pipeline-query';
import type { LabelRow } from '@/lib/actions/labels';
import type { WindowKey } from '@/lib/pipeline-window';

interface Member {
  userId: string;
  email: string;
  fullName: string | null;
}

interface Viewer {
  userId: string;
  role: 'owner' | 'admin' | 'viewer';
  isAgencyAdmin: boolean;
}

interface Props {
  pipelineKey: PipelineKey;
  columns: Record<ColumnKey, PipelineCard[]>;
  totalCards: number;
  viewer: Viewer;
  members: Member[];
  customLabels: LabelRow[];
  filters: {
    q: string;
    assignee: string;
    labelIds: number[];
    windowKey: WindowKey;
    fromIso: string;
    toIso: string;
  };
  assigneeMap: Record<string, string>;
}

/**
 * Sprint Kappa — Layout principal del pipeline visual.
 *
 * Decisión: las métricas (Show% / Close% / Funnel rates) NO viven aquí.
 * Por petición de Iván tras smoke, irán a un /dashboard global con filtros
 * multi-canal (sprint posterior). Los componentes `pipeline-kpi-banner` /
 * `metrics/*` y la tabla DB `pipeline_events` (con triggers) se conservan
 * para reutilizarse en ese sprint.
 */
export function PipelineLayout({
  pipelineKey,
  columns,
  totalCards,
  viewer,
  members,
  customLabels,
  filters,
  assigneeMap,
}: Props) {
  const canDrag = viewer.role === 'owner' || viewer.role === 'admin' || viewer.isAgencyAdmin;

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/40 shrink-0">
        <PipelineSelector active={pipelineKey} />
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {totalCards} {totalCards === 1 ? 'lead' : 'leads'}
        </span>
      </div>
      <div className="shrink-0">
        <PipelineFilters
          q={filters.q}
          assignee={filters.assignee}
          labelIds={filters.labelIds}
          windowKey={filters.windowKey}
          fromIso={filters.fromIso}
          toIso={filters.toIso}
          members={members}
          customLabels={customLabels}
          viewerId={viewer.userId}
        />
      </div>
      {totalCards === 0 ? (
        <PipelineEmpty />
      ) : (
        <div className="flex-1 min-h-0 min-w-0">
          <PipelineBoard columns={columns} canDrag={canDrag} assigneeMap={assigneeMap} />
        </div>
      )}
    </div>
  );
}
