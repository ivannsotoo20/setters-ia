'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Si true, aplica `lg:col-span-2` al `<Card>` para ocupar ancho completo en grid. */
  fullWidth?: boolean;
  /** Acciones opcionales en el header (badges, info-buttons, etc.). */
  headerActions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Card colapsable estilo Fyzon. Diseñada para páginas de settings con muchos
 * bloques (p.ej. `/settings/preferences`): el header funciona como trigger,
 * el contenido se anima en altura, y un chevron rota indicando el estado.
 *
 * Acepta tanto `<CardContent>` como markup libre dentro de `children`.
 */
export function CollapsibleCard({
  title,
  description,
  icon,
  defaultOpen = false,
  fullWidth = false,
  headerActions,
  className,
  children,
}: Props) {
  return (
    <Card className={cn(fullWidth && 'lg:col-span-2', className)}>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/coll-trig w-full text-left rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={typeof title === 'string' ? title : undefined}
          >
            <CardHeader className="cursor-pointer select-none transition-colors hover:bg-muted/30 rounded-t-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    {icon ? <span className="shrink-0">{icon}</span> : null}
                    {title}
                  </CardTitle>
                  {description ? (
                    <CardDescription>{description}</CardDescription>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/coll-trig:rotate-180" />
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
