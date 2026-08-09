'use client';

import { useState, useTransition } from 'react';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { setAiEnabled } from '@/lib/actions/ai-switch';

export function AiSwitchCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    startTransition(async () => {
      const result = await setAiEnabled(next);
      if (!result.ok) {
        toast.error(`No se ha podido cambiar: ${result.error}`);
        return;
      }
      setEnabled(next);
      toast.success(
        next
          ? 'Tu asistente vuelve a responder'
          : 'Tu asistente ha dejado de responder',
      );
    });
  };

  return (
    <Card className={enabled ? undefined : 'border-warning/50 bg-warning/5'}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Power className={`size-4 ${enabled ? 'text-success' : 'text-warning'}`} />
          {enabled ? 'Tu asistente está respondiendo' : 'Tu asistente está parado'}
        </CardTitle>
        <CardDescription>
          {enabled
            ? 'Contesta a las conversaciones que le tocan según lo que hayas configurado.'
            : 'No está contestando a nadie. Sigues recibiendo todos los mensajes.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Pararlo <strong className="text-foreground">no te desconecta</strong>. Los mensajes
          siguen llegando y las conversaciones se guardan enteras: puedes leerlas y contestar
          tú desde aquí. Lo único que no pasa es que conteste el asistente. Cuando lo vuelvas
          a encender, no habrás perdido a nadie por el camino.
        </p>

        <div>
          <Button
            variant={enabled ? 'outline' : 'default'}
            onClick={toggle}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Cambiando…
              </>
            ) : enabled ? (
              'Parar el asistente'
            ) : (
              'Volver a activarlo'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
