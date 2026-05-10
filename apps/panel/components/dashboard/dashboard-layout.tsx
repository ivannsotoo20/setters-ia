import { DashboardFilters } from './dashboard-filters';
import { AlertsList } from './alerts-list';
import { TrendChart } from './trend-chart';
import { DashboardEmpty } from './dashboard-empty';
import { WidgetsGrid } from './widgets-grid';
import { AddWidgetDialog } from './add-widget-dialog';
import type { DashboardSnapshot } from '@/lib/actions/dashboard';

interface Props {
  snapshot: DashboardSnapshot;
}

export function DashboardLayout({ snapshot }: Props) {
  const { filters, trend, alerts, widgets, widgetValues, canEditWidgets, meta } = snapshot;
  const isEmpty = meta.totalConvsCurrent === 0 && trend.every((p) => p.total === 0);

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <DashboardFilters
        active={filters.channelKey}
        windowKey={filters.windowKey}
        fromIso={filters.fromIso}
        toIso={filters.toIso}
      />
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Métricas</h2>
          {canEditWidgets ? <AddWidgetDialog /> : null}
        </div>
        <WidgetsGrid widgets={widgets} values={widgetValues} canEdit={canEditWidgets} />
        <AlertsList alerts={alerts} />
        {isEmpty ? <DashboardEmpty /> : <TrendChart trend={trend} />}
      </div>
    </div>
  );
}
