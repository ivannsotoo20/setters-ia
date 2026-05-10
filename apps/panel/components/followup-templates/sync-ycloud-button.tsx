'use client';

import { useTransition, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { syncYCloudTemplates, type SyncYCloudResult } from '@/lib/actions/ycloud-sync';

export function SyncYCloudButton() {
  const [isPending, startTransition] = useTransition();
  const [last, setLast] = useState<SyncYCloudResult | null>(null);

  function onSync() {
    startTransition(async () => {
      const r = await syncYCloudTemplates();
      if (!r.ok) {
        toast.error(`Sync YCloud: ${r.error}`);
        setLast(null);
      } else {
        const data = r.data!;
        setLast(data);
        const summary = `+${data.added} nuevas · ${data.updated} actualizadas · ${data.skipped} sin cambios`;
        if (data.errors.length > 0) {
          // Mostramos el primer error explícitamente (no solo el conteo) para
          // que el trainer pueda actuar sin mirar logs server-side.
          const first = data.errors[0] ?? '';
          const more = data.errors.length > 1 ? ` (+${data.errors.length - 1} más)` : '';
          toast.warning(`${summary}\n${first}${more}`, { duration: 12000 });
        } else {
          toast.success(`Sync OK: ${summary}`);
        }
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onSync} disabled={isPending}>
        <RefreshCw className={`size-3.5 mr-1 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Sincronizando…' : 'Sincronizar YCloud'}
      </Button>
      {last ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {last.errors.length === 0 ? (
            <CheckCircle2 className="size-3 text-emerald-500" />
          ) : (
            <AlertCircle className="size-3 text-amber-500" />
          )}
          {last.added}+ {last.updated}~ {last.skipped}=
        </div>
      ) : null}
    </div>
  );
}
