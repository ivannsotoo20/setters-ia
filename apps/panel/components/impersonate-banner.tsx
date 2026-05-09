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
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex items-center gap-3 text-sm">
      <Eye className="size-4 text-amber-400 shrink-0" />
      <span className="flex-1 text-amber-200">
        Estás viendo el panel como{' '}
        <strong className="text-amber-100">{tenantName}</strong>. Cualquier acción
        afecta a esa sub-cuenta.
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onStop}
        disabled={pending}
        className="border-amber-500/40 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100"
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
