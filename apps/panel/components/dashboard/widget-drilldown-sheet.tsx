'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Minus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { listWidgetMembers, type WidgetMemberRow } from '@/lib/actions/dashboard-drilldown';
import type { WidgetMetricDef, WidgetFilter } from '@/lib/widget-catalog';

/**
 * Lista de personas detrás de un widget (2026-09-02). Se abre al pulsar la
 * tarjeta; cada fila lleva a la conversación en `/conversations?selected=<id>`,
 * el mismo enlace profundo que usan contactos, pipeline y calendarios.
 *
 * Carga al abrir, no antes: el dashboard no paga el coste de listas que nadie
 * despliega.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  def: WidgetMetricDef;
  filter: WidgetFilter;
  channelKey: string;
  fromIso: string;
  toIso: string;
  /** Lo que muestra la tarjeta, para que el título y la lista se lean juntos. */
  displayValue: string;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  const min = Math.round(ms / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function WidgetDrilldownSheet(props: Props) {
  const { open, onOpenChange, def, filter, channelKey, fromIso, toIso, displayValue } = props;
  const [rows, setRows] = useState<WidgetMemberRow[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isRate = def.category === 'rate';

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    startTransition(async () => {
      const r = await listWidgetMembers({
        metricKey: def.key,
        filter,
        channelKey,
        fromIso,
        toIso,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRows(r.data.rows);
      setMeta({ total: r.data.total, truncated: r.data.truncated });
    });
    // La lista depende de la tarjeta y de la ventana; si cambian, se recarga al abrir.
  }, [open, def.key, filter, channelKey, fromIso, toIso]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <SheetTitle className="flex items-baseline gap-2">
            <span>{def.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{displayValue}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {def.description}
            {meta ? (
              <>
                {' '}
                · {meta.total} {meta.total === 1 ? 'persona' : 'personas'}
                {isRate ? ' en el denominador' : ''}
                {meta.truncated ? ` (se muestran ${rows?.length ?? 0})` : ''}
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
          {error ? (
            <p className="px-3 py-6 text-sm text-destructive">Error cargando la lista: {error}</p>
          ) : isPending || rows === null ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Nadie en esta métrica en el periodo seleccionado.
            </p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((r) => (
                <li key={r.conversationId}>
                  <Link
                    href={`/conversations?selected=${r.conversationId}`}
                    className="group flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/60 transition-colors"
                  >
                    {isRate ? (
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                          r.inNumerator
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border text-muted-foreground/60',
                        )}
                        title={r.inNumerator ? 'Cuenta en el numerador' : 'Solo en el denominador'}
                      >
                        {r.inNumerator ? <Check className="size-3" /> : <Minus className="size-3" />}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{r.leadName}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                          {r.channelLabel}
                        </Badge>
                        <span>F{r.phase}</span>
                        <span>·</span>
                        <span>{formatWhen(r.lastMessageAt)}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
