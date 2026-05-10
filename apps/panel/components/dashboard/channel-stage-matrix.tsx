'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ALL_MATRIX_COLUMNS,
  type MatrixData,
  type MatrixColumnKey,
  type ChannelKey,
} from '@/lib/dashboard-query';
import { ArrowDown, ArrowUp } from 'lucide-react';

interface Props {
  matrix: MatrixData;
  activeChannel: 'all' | ChannelKey;
}

const CHANNEL_LABELS: Record<MatrixColumnKey, string> = {
  wa: 'WhatsApp',
  fb: 'Facebook',
  'ig-in': 'IG Inbound',
  'ig-out': 'IG Outbound',
  total: 'Total',
};

// HSL hue base por canal para heatmap
const CHANNEL_HUES: Record<MatrixColumnKey, number | null> = {
  wa: 142, // verde
  fb: 217, // azul
  'ig-in': 271, // morado
  'ig-out': 326, // rosa
  total: null,
};

export function ChannelStageMatrix({ matrix, activeChannel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setChannel(col: MatrixColumnKey) {
    if (col === 'total') return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('ch', col);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function colorForCell(col: MatrixColumnKey, intensity: number) {
    if (col === 'total') return undefined;
    const hue = CHANNEL_HUES[col];
    if (hue == null) return undefined;
    if (intensity === 0) return undefined;
    // intensity 0-1 → opacidad 0.05-0.25
    const opacity = 0.05 + intensity * 0.2;
    return `hsla(${hue}, 70%, 50%, ${opacity})`;
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/40 text-[11px] uppercase tracking-wide text-muted-foreground">
        Comparativa canal × etapa
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border/40 bg-muted/20">
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Etapa</th>
              {ALL_MATRIX_COLUMNS.map((col) => {
                const isActive = activeChannel === col;
                const isClickable = col !== 'total';
                return (
                  <th
                    key={col}
                    className={cn(
                      'text-center px-2 py-1.5 font-medium text-muted-foreground min-w-[88px]',
                      isClickable && 'cursor-pointer hover:bg-muted/30',
                      isActive && 'text-foreground',
                    )}
                    onClick={() => isClickable && setChannel(col)}
                  >
                    {CHANNEL_LABELS[col]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.key} className="border-b border-border/30 last:border-0">
                <td className="text-left px-3 py-2 font-medium text-foreground/90">{row.label}</td>
                {ALL_MATRIX_COLUMNS.map((col) => {
                  const cell = row.cells[col];
                  const bg = colorForCell(col, cell.intensity);
                  return (
                    <td
                      key={col}
                      className="text-center px-2 py-2 align-middle"
                      style={{ backgroundColor: bg }}
                    >
                      <div className="text-base font-semibold">{cell.count}</div>
                      {cell.deltaPct != null && Math.abs(cell.deltaPct) >= 0.1 && cell.prevCount > 0 ? (
                        <div className="flex items-center justify-center gap-0.5 text-[10px]">
                          {cell.deltaPct > 0 ? (
                            <ArrowUp className="size-2.5 text-emerald-500" />
                          ) : (
                            <ArrowDown className="size-2.5 text-rose-500" />
                          )}
                          <span
                            className={cn(
                              cell.deltaPct > 0 ? 'text-emerald-500' : 'text-rose-500',
                            )}
                          >
                            {Math.abs(Math.round(cell.deltaPct * 100))}%
                          </span>
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
