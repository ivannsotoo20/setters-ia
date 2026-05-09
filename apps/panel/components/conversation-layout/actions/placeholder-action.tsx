'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  variant?: 'icon' | 'iconWithLabel';
}

/**
 * Botón placeholder disabled con tooltip explicativo. Usado para acciones
 * cuyo backend llega en sprints posteriores (Mover/Etiquetas → Eta,
 * Programar mensaje/Forzar IA → Iota).
 */
export function PlaceholderAction({ label, icon: Icon, tooltip, variant = 'icon' }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              variant="ghost"
              size={variant === 'iconWithLabel' ? 'sm' : 'icon'}
              disabled
              aria-disabled="true"
              aria-label={label}
              className="opacity-60 cursor-not-allowed"
            >
              <Icon className="size-4" />
              {variant === 'iconWithLabel' ? <span className="ml-2">{label}</span> : null}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
