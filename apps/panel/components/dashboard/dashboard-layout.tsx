import { DashboardFilters } from './dashboard-filters';
import { KpiRow } from './kpi-row';
import { AlertsList } from './alerts-list';
import { TrendChart } from './trend-chart';
import { DashboardEmpty } from './dashboard-empty';
import type { DashboardSnapshot } from '@/lib/actions/dashboard';

interface Props {
  snapshot: DashboardSnapshot;
}

export function DashboardLayout({ snapshot }: Props) {
  const { filters, kpis, trend, alerts, meta } = snapshot;
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
        <KpiRow kpis={kpis} />
        <AlertsList alerts={alerts} />
        {isEmpty ? <DashboardEmpty /> : <TrendChart trend={trend} />}
      </div>
    </div>
  );
}
