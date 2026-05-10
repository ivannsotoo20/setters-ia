import { BarChart3 } from 'lucide-react';

export function DashboardEmpty({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 p-12 h-full">
      <BarChart3 className="size-10 text-muted-foreground/40" />
      <h3 className="text-sm font-medium text-muted-foreground">Sin datos suficientes</h3>
      <p className="text-xs text-muted-foreground max-w-md">
        {message ??
          'Aún no hay actividad en este periodo. Prueba ampliando el rango de fechas o cambiando el canal.'}
      </p>
    </div>
  );
}
