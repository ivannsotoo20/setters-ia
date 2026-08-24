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
    label: 'A cualquiera que te escriba',
    description:
      'Tu asistente contesta a todo el que te escriba por WhatsApp, venga de donde venga.',
    tradeoff:
      'Es el que más oportunidades coge y también el que menos filtra: contestará igual a un conocido, a un proveedor o a alguien que se equivocó de número.',
  },
  {
    value: 'form_only',
    label: 'Solo a quien rellenó tu formulario',
    description:
      'Contesta únicamente a las personas que dejaron sus datos en un formulario tuyo. Si alguien te escribe directo sin haber pasado por ahí, tu asistente no responde.',
    tradeoff:
      'El más estricto. Te aseguras de hablar solo con quien ya mostró interés, a costa de dejar pasar a quien te escribe por su cuenta.',
  },
  {
    value: 'keyword',
    label: 'Solo si dicen una palabra concreta',
    description:
      'Contesta a quien venga de formulario y, además, a quien escriba alguna de las palabras que tú elijas (por ejemplo "info" o "quiero empezar"). Las defines en Palabras clave.',
    tradeoff:
      'Punto medio, y el más seguro para empezar a probar. Ojo: si no defines ninguna palabra, tu asistente no contestará a nadie que te escriba nuevo.',
  },
];

export function WaModeForm({ currentMode, waOpenKeywordCount }: Props) {
  const [selected, setSelected] = useState<WaInboundMode>(currentMode);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    if (selected === currentMode) {
      toast.info('Ya tienes seleccionada esta opción');
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
      toast.success('Guardado. Tu asistente ya responde con este criterio.');
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
                  Para elegir esta opción, define antes al menos una palabra en{' '}
                  <Link href="/keywords" className="underline">
                    Palabras clave
                  </Link>
                  . Si no, no contestaría a nadie.
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
