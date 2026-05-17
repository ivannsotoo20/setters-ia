import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowDownRight, ArrowUpRight, Minus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDelta,
  type KpiValue,
  type RateKpiValue,
} from '@/lib/dashboard-metrics';
import { formatPercent } from '@/lib/pipeline-metrics';

interface BaseProps {
  label: string;
  tooltip: string;
}

interface VolumeProps extends BaseProps {
  variant: 'volume';
  value: KpiValue;
}

interface RateProps extends BaseProps {
  variant: 'rate';
  value: RateKpiValue;
}

type Props = VolumeProps | RateProps;

export function KpiCard(props: Props) {
  const { label, tooltip, value } = props;
  const isVolume = props.variant === 'volume';

  const displayValue = isVolume
    ? new Intl.NumberFormat('es-ES').format((value as KpiValue).current)
    : (value as RateKpiValue).denominator === 0
      ? '—'
      : formatPercent((value as RateKpiValue).current);

  const deltaText = formatDelta(value);
  const deltaSign = value.deltaSign;

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200">
        <CardContent className="p-4 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
            <span className="truncate">{label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help shrink-0 text-muted-foreground/60 hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </div>
          <div className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground">
            {displayValue}
          </div>
          <div className="flex items-center gap-1 text-[10px] tabular-nums">
            {value.hasInsufficientData ? (
              <span className="text-muted-foreground/70">datos insuficientes</span>
            ) : value.deltaPct == null ? (
              <span className="text-muted-foreground">— (sin periodo previo)</span>
            ) : (
              <>
                {deltaSign === 'up' ? (
                  <ArrowUpRight className="size-3 text-success" />
                ) : deltaSign === 'down' ? (
                  <ArrowDownRight className="size-3 text-destructive" />
                ) : (
                  <Minus className="size-3 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    'font-medium',
                    deltaSign === 'up' && 'text-success',
                    deltaSign === 'down' && 'text-destructive',
                    deltaSign === 'flat' && 'text-muted-foreground',
                  )}
                >
                  {deltaText}
                </span>
                <span className="text-muted-foreground/70">vs periodo anterior</span>
              </>
            )}
            {!isVolume ? (
              <span className="text-muted-foreground/70 ml-1">
                ({(value as RateKpiValue).numerator}/{(value as RateKpiValue).denominator})
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
