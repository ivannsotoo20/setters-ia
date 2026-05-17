'use client';

import { useTransition } from 'react';
import { Eye, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { stopImpersonating } from '@/lib/actions/admin';

interface Props {
  tenantName: string;
}

export function ImpersonateBanner({ tenantName }: Props) {
  const [pending, startTransition] = useTransition();

  const onStop = () => {
    startTransition(async () => {
      const result = await stopImpersonating();
      if (!result.ok) {
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success('Volviste a tu vista de agencia');
      }
    });
  };

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 flex items-center gap-3 text-sm">
      <Eye className="size-4 text-warning shrink-0" />
      <span className="flex-1 text-warning/90">
        Estás viendo el panel como{' '}
        <strong className="text-warning">{tenantName}</strong>. Cualquier acción
        afecta a esa sub-cuenta.
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onStop}
        disabled={pending}
        className="border-warning/40 text-warning/90 hover:bg-warning/20 hover:text-warning"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <>
            <X className="size-3.5" />
            Salir
          </>
        )}
      </Button>
    </div>
  );
}
