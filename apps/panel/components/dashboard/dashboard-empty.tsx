import { BarChart3 } from 'lucide-react';

export function DashboardEmpty({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 p-12">
      <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <BarChart3 className="size-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold tracking-tight">Sin datos suficientes</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {message ??
            'Aún no hay actividad en este periodo. Prueba ampliando el rango de fechas o cambiando el canal.'}
        </p>
      </div>
    </div>
  );
}
