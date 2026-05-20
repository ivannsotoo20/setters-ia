'use client';

import { ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type EnforcementLevel = 'strict' | 'best_effort';

interface Props {
  level: EnforcementLevel;
  /** Variante visual: `chip` (badge inline pequeño con texto) o `dot` (solo icono mini, útil junto a Label). */
  variant?: 'chip' | 'dot';
  className?: string;
}

const COPY: Record<EnforcementLevel, { label: string; tooltip: string; iconClass: string; chipClass: string }> = {
  strict: {
    label: 'Estricto',
    tooltip:
      'Cumplimiento estricto: el motor valida tu configuración antes de enviar el mensaje al lead. Si el modelo intenta saltársela, el sistema lo obliga a reescribir antes de enviar. Se cumple al 100%.',
    iconClass: 'text-emerald-500',
    chipClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  best_effort: {
    label: 'Best effort',
    tooltip:
      'Mejor esfuerzo: tu configuración se inyecta al modelo como sugerencia. La sigue en la mayoría de los casos, pero puede desviarse en momentos puntuales (lead muy emocional, contextos complejos). Para control estricto, usa las preferencias marcadas con "Estricto".',
    iconClass: 'text-amber-500',
    chipClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
};

/**
 * Hito 12.1 — Pequeño indicador junto a cada preferencia del trainer que comunica
 * si la configuración se cumple al 100% (enforce en código) o si es una sugerencia
 * al modelo (best effort). Tooltip detalla el contrato exacto.
 *
 * Usage:
 *   <EnforcementBadge level="strict" />        ← chip "Estricto" verde
 *   <EnforcementBadge level="best_effort" />   ← chip "Best effort" ámbar
 *   <EnforcementBadge level="strict" variant="dot" />  ← solo icono junto a un Label
 */
export function EnforcementBadge({ level, variant = 'chip', className }: Props) {
  const copy = COPY[level];
  const Icon = level === 'strict' ? ShieldCheck : Sparkles;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {variant === 'dot' ? (
            <span
              role="img"
              aria-label={copy.label}
              className={cn('inline-flex items-center', className)}
            >
              <Icon className={cn('size-3.5', copy.iconClass)} />
            </span>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
                copy.chipClass,
                className,
              )}
            >
              <Icon className="size-3" />
              {copy.label}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs leading-snug">
          {copy.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
