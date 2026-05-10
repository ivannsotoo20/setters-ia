import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { formatPercent, type RateMetric } from '@/lib/pipeline-metrics';

interface Props {
  showRate: RateMetric;
  closeRate: RateMetric;
}

export function ShowCloseRates({ showRate, closeRate }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <RateCard
          label="Show%"
          rate={showRate}
          tooltip="De las citas agendadas (won + lost + cancelled + no-show), qué % se presentó (won + lost)."
        />
        <RateCard
          label="Close%"
          rate={closeRate}
          tooltip="De los que se presentaron (won + lost), qué % cerró compra (won)."
        />
      </div>
    </TooltipProvider>
  );
}

function RateCard({ label, rate, tooltip }: { label: string; rate: RateMetric; tooltip: string }) {
  const pct = rate.denominator > 0 ? formatPercent(rate.rate) : '—';
  return (
    <Card className="bg-muted/20 border-border/50">
      <CardContent className="p-3 flex flex-col gap-0.5">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
          </Tooltip>
        </div>
        <div className="text-2xl font-semibold tabular-nums leading-none">{pct}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {rate.numerator} / {rate.denominator}
          {rate.denominator === 0 ? ' · sin datos' : ''}
        </div>
      </CardContent>
    </Card>
  );
}
