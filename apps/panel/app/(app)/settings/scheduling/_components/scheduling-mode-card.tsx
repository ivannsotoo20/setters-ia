'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bot, Link2, AlertTriangle, Info, Loader2, Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setSchedulingMode } from '@/lib/actions/scheduling';

interface Props {
  initialMode: 'direct' | 'link' | null;
}

export function SchedulingModeCard({ initialMode }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'direct' | 'link' | null>(initialMode);
  const [savingMode, setSavingMode] = useState<'direct' | 'link' | null>(null);
  const [, startTransition] = useTransition();

  async function handleSelect(next: 'direct' | 'link') {
    if (mode === next || savingMode != null) return;
    setSavingMode(next);
    try {
      const r = await setSchedulingMode(next);
      if (!r.ok) {
        toast.error(`No se pudo guardar: ${r.error}`);
        return;
      }
      setMode(next);
      toast.success(
        next === 'direct'
          ? 'Modo guardado: la IA agendará directamente'
          : 'Modo guardado: la IA enviará el enlace del calendario',
      );
      startTransition(() => router.refresh());
    } finally {
      setSavingMode(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cómo agenda la IA</CardTitle>
        <CardDescription>
          Elige entre que la IA cree la cita directamente en GHL o que envíe el
          enlace de tu calendario al lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === null ? (
          <div className="flex gap-2 items-start rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-3 text-sm">
            <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Aún no has elegido cómo agendar.
              </p>
              <p className="text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                Mientras no decidas, el setter usa el modo enlace como fallback
                seguro.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid sm:grid-cols-2 gap-3">
          <ModeOption
            active={mode === 'direct'}
            saving={savingMode === 'direct'}
            disabled={savingMode != null}
            onClick={() => handleSelect('direct')}
            icon={<Bot className="size-5" aria-hidden />}
            title="La IA agenda directamente"
            description="La IA propone los huecos disponibles por chat. Cuando el lead acepta, la cita se crea automáticamente en GHL. Cero fricción para el lead."
          />
          <ModeOption
            active={mode === 'link'}
            saving={savingMode === 'link'}
            disabled={savingMode != null}
            onClick={() => handleSelect('link')}
            icon={<Link2 className="size-5" aria-hidden />}
            title="La IA envía el enlace"
            description="La IA pega el enlace de tu calendario GHL y el lead reserva fuera del chat en el widget de Go High Level."
          />
        </div>

        {mode === 'link' ? (
          <div className="flex gap-2 items-start rounded-md border border-orange-300/60 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700/40 p-3 text-sm">
            <AlertTriangle className="size-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-orange-900 dark:text-orange-200">
                Riesgo a tener en cuenta
              </p>
              <p className="text-orange-900/80 dark:text-orange-100/80">
                Si el lead reserva en el enlace pero{' '}
                <strong>no confirma por chat</strong> que lo ha hecho, en tu
                calendario GHL aparecerá la cita pero no sabrás de qué lead
                viene ni en qué fase está. Tendrás que mirar el pipeline
                manualmente.
              </p>
              <p className="text-orange-900/80 dark:text-orange-100/80">
                Si quieres distinguir el origen del booking automáticamente,
                asigna <strong>un calendario distinto a cada canal</strong>{' '}
                (WhatsApp / Instagram / Facebook) en{' '}
                <a
                  href="/settings/calendars"
                  className="underline underline-offset-2 hover:text-orange-700 dark:hover:text-orange-300"
                >
                  Calendarios
                </a>
                . Así el calendar GHL en que cae la cita ya te dice de qué canal
                vino.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ModeOption({
  active,
  saving,
  disabled,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-all relative',
        'hover:border-foreground/30 hover:bg-accent/30',
        active
          ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
          : 'border-border',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
      aria-pressed={active}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-md',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70',
          )}
        >
          {icon}
        </div>
        <div className="size-5">
          {saving ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : active ? (
            <Check className="size-4 text-primary" />
          ) : null}
        </div>
      </div>
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      </div>
    </button>
  );
}
