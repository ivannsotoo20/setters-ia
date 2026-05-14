'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { backfillAppointments } from '@/lib/actions/calendars';

export function BackfillButton() {
  const router = useRouter();
  const [loading, startBackfill] = useTransition();
  const [_running, setRunning] = useState(false);

  function handleClick() {
    setRunning(true);
    startBackfill(async () => {
      const result = await backfillAppointments({ daysBack: 90, daysForward: 90 });
      setRunning(false);
      if (!result.ok) {
        toast.error(`Importación falló: ${result.error}`);
        return;
      }
      const { fetched, upserted, matched, unmatched, errorsCount } = result.data!;
      toast.success(
        `Importadas ${upserted}/${fetched} citas (matched: ${matched}, sin asociar: ${unmatched})${errorsCount ? `, errores: ${errorsCount}` : ''}`,
        { duration: 6000 },
      );
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} disabled={loading} variant="outline">
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando…
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" /> Importar citas existentes
        </>
      )}
    </Button>
  );
}
