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

/**
 * Dashboard del trainer — siempre muestra el layout normal (filtros + métricas
 * + alertas + tendencia) aunque el setup esté pendiente.
 *
 * El recordatorio del setup pendiente vive ahora en:
 *   - Sidebar > Configuración > Setup (con badge "Pendiente · N/4").
 *   - Auto-redirect a `/settings/setup` la primera vez (FirstVisitRedirect en page).
 *
 * Esto reemplaza al banner sticky + tarjeta "ActivationChecklist" que bloqueaban
 * el dashboard cuando `onboardedAt IS NULL`.
 */
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
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Métricas
          </h2>
          {canEditWidgets ? <AddWidgetDialog /> : null}
        </div>
        <WidgetsGrid
          widgets={widgets}
          values={widgetValues}
          canEdit={canEditWidgets}
          channelKey={filters.channelKey}
          fromIso={filters.fromIso}
          toIso={filters.toIso}
        />

        <AlertsList alerts={alerts} />
        {isEmpty ? <DashboardEmpty /> : <TrendChart trend={trend} />}
      </div>
    </div>
  );
}
