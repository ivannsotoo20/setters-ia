'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  clearAnthropicKey,
  setAnthropicKey,
  type AnthropicKeyState,
} from '@/lib/actions/anthropic-key';

export function AnthropicKeyCard({ initial }: { initial: AnthropicKeyState }) {
  const [state, setState] = useState(initial);
  const [value, setValue] = useState('');
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await setAnthropicKey(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Clave guardada y comprobada con Anthropic.');
      setState({ hasOwnKey: true, hint: value.trim().slice(-4) });
      setValue('');
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await clearAnthropicKey();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Clave retirada.');
      setState({ hasOwnKey: false, hint: null });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tu cuenta de inteligencia artificial</CardTitle>
        <CardDescription>
          Tu asistente usa Anthropic para escribir. Si pones tu clave, el consumo se factura
          a tu cuenta y ves tú el gasto. Si no pones ninguna, funciona igual con la cuenta de
          Fyzon.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.hasOwnKey ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-primary" />
              <span>
                Usando tu propia cuenta
                {state.hint ? (
                  <span className="text-muted-foreground"> · clave terminada en {state.hint}</span>
                ) : null}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={remove} disabled={pending}>
              Quitar mi clave
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Ahora mismo estás usando la cuenta de Fyzon. No tienes que hacer nada, pero si
            prefieres tener tu propio consumo y tu propia factura, pega aquí tu clave.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="anthropicKey">
            {state.hasOwnKey ? 'Cambiar la clave' : 'Tu clave de Anthropic'}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="anthropicKey"
              type="password"
              autoComplete="off"
              className="min-w-64 flex-1"
              placeholder="sk-ant-..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
            />
            <Button onClick={save} disabled={pending || !value.trim()}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Comprobando…
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La sacas de{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
            , en Settings › API keys. Antes de guardarla comprobamos que funciona y que la
            cuenta tiene saldo, para que no te enteres del problema cuando te escriba una
            persona. Se guarda cifrada y nadie vuelve a verla.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
