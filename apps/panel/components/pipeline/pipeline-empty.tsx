import { Kanban } from 'lucide-react';

interface Props {
  message?: string;
}

export function PipelineEmpty({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 p-12 h-full">
      <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Kanban className="size-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold tracking-tight">Pipeline vacío</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {message ??
            'Aún no hay conversaciones para este pipeline en el periodo seleccionado. Prueba ampliando el rango de fechas o cambiando el canal.'}
        </p>
      </div>
    </div>
  );
}
