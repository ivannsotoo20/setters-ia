import { DashboardFilters } from './dashboard-filters';
import { AlertsList } from './alerts-list';
import { TrendChart } from './trend-chart';
import { DashboardEmpty } from './dashboard-empty';
import { WidgetsGrid } from './widgets-grid';
import { AddWidgetDialog } from './add-widget-dialog';
import { ActivationChecklist } from './activation-checklist';
import type { DashboardSnapshot } from '@/lib/actions/dashboard';
import type { TenantHealth } from '@/lib/tenant-health';

interface Props {
  snapshot: DashboardSnapshot;
  /**
   * Salud del tenant efectivo. Si está presente y `onboardedAt IS NULL`,
   * mostramos la `ActivationChecklist` en lugar de los KPI widgets. Si no
   * está presente o ya está onboardeado, dashboard normal.
   */
  tenantHealth?: TenantHealth | null;
}

export function DashboardLayout({ snapshot, tenantHealth }: Props) {
  const { filters, trend, alerts, widgets, widgetValues, canEditWidgets, meta } = snapshot;
  const isEmpty = meta.totalConvsCurrent === 0 && trend.every((p) => p.total === 0);

  const showActivationChecklist =
    tenantHealth != null && tenantHealth.onboardedAt == null;

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <DashboardFilters
        active={filters.channelKey}
        windowKey={filters.windowKey}
        fromIso={filters.fromIso}
        toIso={filters.toIso}
      />
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
        {showActivationChecklist ? (
          <ActivationChecklist health={tenantHealth!} />
        ) : null}

        {!showActivationChecklist ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Métricas</h2>
              {canEditWidgets ? <AddWidgetDialog /> : null}
            </div>
            <WidgetsGrid widgets={widgets} values={widgetValues} canEdit={canEditWidgets} />
          </>
        ) : null}

        <AlertsList alerts={alerts} />
        {!showActivationChecklist && (isEmpty ? <DashboardEmpty /> : <TrendChart trend={trend} />)}
      </div>
    </div>
  );
}
