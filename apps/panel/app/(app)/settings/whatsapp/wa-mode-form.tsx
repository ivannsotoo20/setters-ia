'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setWaInboundMode, type WaInboundMode } from '@/lib/actions/wa-inbound-mode';

interface Props {
  currentMode: WaInboundMode;
  waOpenKeywordCount: number;
}

const MODES: {
  value: WaInboundMode;
  label: string;
  description: string;
  tradeoff: string;
}[] = [
  {
    value: 'all',
    label: 'Responder a todo el mundo',
    description: 'Cualquier mensaje WA inbound activa la IA. Comportamiento por defecto.',
    tradeoff:
      'Filtro mínimo. Si recibes mensajes WhatsApp en frío que no quieres responder, mejor usa "form" o "keyword".',
  },
  {
    value: 'form_only',
    label: 'Solo si vinieron por formulario',
    description:
      'La IA solo responde a leads que llegaron por /automations/lead-form (formulario VSL, GHL Workflow, Tally, Meta Lead Ads…). Lead frío en WA → silencio.',
    tradeoff:
      'Más estricto. Útil si quieres que solo respondas a leads cualificados por formulario y no a contactos random.',
  },
  {
    value: 'keyword',
    label: 'Solo si matchea una keyword',
    description:
      'Acepta leads de formulario + leads frescos cuyo primer mensaje contenga alguna keyword tipo wa_open (ej: "hola", "INFO", "me interesa"). Configura keywords en /keywords.',
    tradeoff:
      'Modo intermedio. Necesitas tener al menos 1 keyword wa_open activa o todos los inbound de leads frescos quedarán silenciados.',
  },
];

export function WaModeForm({ currentMode, waOpenKeywordCount }: Props) {
  const [selected, setSelected] = useState<WaInboundMode>(currentMode);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    if (selected === currentMode) {
      toast.info('Ya estás en este modo');
      return;
    }
    startTransition(async () => {
      const result = await setWaInboundMode(selected);
      if (!result.ok) {
        toast.error(result.error);
        // Revertir selección visual
        setSelected(currentMode);
        return;
      }
      toast.success(`Modo cambiado a "${selected}"`);
    });
  };

  const dirty = selected !== currentMode;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {MODES.map((mode) => {
          const isSelected = selected === mode.value;
          const isCurrent = currentMode === mode.value;
          const disabled = mode.value === 'keyword' && waOpenKeywordCount === 0 && !isCurrent;

          return (
            <button
              key={mode.value}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(mode.value)}
              className={`flex flex-col items-start gap-1.5 rounded-md border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:border-primary/50'
              } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">{mode.label}</span>
                <div className="flex items-center gap-2">
                  {isCurrent && (
                    <span className="text-xs text-muted-foreground">(actual)</span>
                  )}
                  {isSelected && <CheckCircle2 className="size-4 text-primary" />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{mode.description}</p>
              <p className="mt-1 text-xs italic text-muted-foreground/70">{mode.tradeoff}</p>
              {disabled && (
                <p className="mt-1 text-xs text-warning/95">
                  Necesitas crear al menos 1 keyword wa_open en{' '}
                  <Link href="/keywords" className="underline">
                    /keywords
                  </Link>{' '}
                  antes de poder seleccionar este modo.
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {dirty && (
          <Button variant="outline" onClick={() => setSelected(currentMode)} disabled={pending}>
            Cancelar
          </Button>
        )}
        <Button onClick={onSubmit} disabled={pending || !dirty}>
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar cambios'
          )}
        </Button>
      </div>
    </div>
  );
}
