'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setGhlInboundMode, type GhlInboundMode } from '@/lib/actions/ghl-inbound-mode';

interface Props {
  currentMode: GhlInboundMode;
  /** Palabras activas que hacen entrar al asistente en Instagram/Facebook. */
  inboundKeywordCount: number;
}

const MODES: {
  value: GhlInboundMode;
  label: string;
  description: string;
  tradeoff: string;
}[] = [
  {
    value: 'classified_only',
    label: 'Solo a quien diga una palabra concreta',
    description:
      'Tu asistente contesta a quien llegue por tus campañas y a quien escriba alguna de las palabras que tú elijas. Al resto no le responde, pero su mensaje se guarda aquí para que lo veas y contestes tú si quieres.',
    tradeoff:
      'Es el criterio recomendado. Una amiga, un proveedor o alguien que solo comenta una foto no reciben respuesta automática.',
  },
  {
    value: 'all',
    label: 'A cualquiera que te escriba',
    description:
      'Tu asistente contesta a todos los mensajes directos que entren por Instagram o Facebook, sin filtrar.',
    tradeoff:
      'Ninguna conversación se queda sin respuesta, pero contestará igual a gente conocida, a mensajes personales y a spam. Piénsalo dos veces si usas la cuenta también para hablar con tu círculo.',
  },
];

export function GhlModeForm({ currentMode, inboundKeywordCount }: Props) {
  const [selected, setSelected] = useState<GhlInboundMode>(currentMode);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    if (selected === currentMode) {
      toast.info('Ya tienes seleccionada esta opción');
      return;
    }
    startTransition(async () => {
      const result = await setGhlInboundMode(selected);
      if (!result.ok) {
        toast.error(result.error);
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

          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => setSelected(mode.value)}
              className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-md border p-4 text-left transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">{mode.label}</span>
                <div className="flex items-center gap-2">
                  {isCurrent ? (
                    <span className="text-xs text-muted-foreground">(actual)</span>
                  ) : null}
                  {isSelected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{mode.description}</p>
              <p className="mt-1 text-xs italic text-muted-foreground/70">{mode.tradeoff}</p>
            </button>
          );
        })}
      </div>

      {/*
        El equivalente al aviso de WhatsApp. Aquí NO se bloquea la opción, porque
        a diferencia de WhatsApp el mensaje que no pasa el filtro sí se guarda:
        el entrenador lo ve en Conversaciones y puede contestar a mano. Es un
        estado silencioso, no uno de pérdida de datos.
      */}
      {selected === 'classified_only' && inboundKeywordCount === 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm">
          <p className="font-medium text-warning">
            Aún no has definido ninguna palabra
          </p>
          <p className="mt-1 text-xs text-warning/90">
            Con este criterio y sin palabras definidas, tu asistente no contestará a
            nadie que te escriba nuevo. Los mensajes se guardan igualmente en
            Conversaciones para que los respondas tú.
          </p>
          <Link href="/keywords" className="mt-2 inline-block text-xs text-warning underline">
            Definir mis palabras
          </Link>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        {dirty ? (
          <Button variant="outline" onClick={() => setSelected(currentMode)} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
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
