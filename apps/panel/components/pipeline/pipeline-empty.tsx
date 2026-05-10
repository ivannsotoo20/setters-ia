import { Kanban } from 'lucide-react';

interface Props {
  message?: string;
}

export function PipelineEmpty({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 p-12 h-full">
      <Kanban className="size-10 text-muted-foreground/40" />
      <h3 className="text-sm font-medium text-muted-foreground">Pipeline vacío</h3>
      <p className="text-xs text-muted-foreground max-w-md">
        {message ??
          'Aún no hay conversaciones para este pipeline en el periodo seleccionado. Prueba ampliando el rango de fechas o cambiando el canal.'}
      </p>
    </div>
  );
}
