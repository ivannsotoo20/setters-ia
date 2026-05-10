import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPercent, type FunnelRate } from '@/lib/pipeline-metrics';

interface Props {
  rates: FunnelRate[];
}

export function FunnelMiniBar({ rates }: Props) {
  const allEmpty = rates.every((r) => r.fromCount === 0);
  return (
    <TooltipProvider delayDuration={200}>
      <Card className="bg-muted/20 border-border/50">
        <CardContent className="p-3 flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Funnel F1 → F7
          </div>
          {allEmpty ? (
            <div className="text-xs text-muted-foreground italic py-2">
              Aún no hay datos suficientes en este periodo.
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {rates.map((r, idx) => {
                const pct = r.fromCount > 0 ? r.rate : 0;
                const widthPct = Math.max(8, pct * 100);
                return (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 cursor-help flex flex-col gap-0.5 min-w-0">
                        <div className="text-[8px] text-muted-foreground tabular-nums text-center">
                          F{r.from}→F{r.to}
                        </div>
                        <div className="h-2 rounded-sm bg-muted overflow-hidden relative">
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/70"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <div className="text-[9px] tabular-nums text-foreground/80 text-center">
                          {r.fromCount > 0 ? formatPercent(r.rate) : '—'}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      F{r.from} → F{r.to}: {r.toCount} de {r.fromCount} avanzaron
                      {r.fromCount > 0 ? ` (${formatPercent(r.rate)})` : ''}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
