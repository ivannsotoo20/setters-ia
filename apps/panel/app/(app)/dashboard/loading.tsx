import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto de /dashboard mientras `loadDashboardData` consulta (2026-11-04).
 *
 * Hasta hoy no había `loading.tsx`: al pulsar «Dashboard» la pantalla anterior
 * se quedaba congelada varios segundos sin ninguna señal, y Tania lo leía como
 * «va lento». Con este fichero Next.js envuelve la página en un Suspense y
 * pinta esto al instante mientras llegan los datos. Reproduce la silueta real:
 * barra de filtros, rejilla de métricas, alertas y tendencia.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background" aria-busy="true" aria-label="Cargando dashboard">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-7 w-36 rounded-md" />
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-28 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex-1 min-h-48">
          <Skeleton className="h-3 w-56 mb-4" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
