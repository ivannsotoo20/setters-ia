import { ShowCloseRates } from './metrics/show-close-rates';
import { FunnelMiniBar } from './metrics/funnel-mini-bar';
import type { PipelineEvent } from '@/lib/pipeline-metrics';
import {
  computeShowRate,
  computeCloseRate,
  computeFunnelRates,
} from '@/lib/pipeline-metrics';

interface Props {
  events: PipelineEvent[];
}

export function PipelineKpiBanner({ events }: Props) {
  const showRate = computeShowRate(events);
  const closeRate = computeCloseRate(events);
  const funnelRates = computeFunnelRates(events);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-2 sm:gap-3 px-3 py-2 border-b border-border/40">
      <ShowCloseRates showRate={showRate} closeRate={closeRate} />
      <FunnelMiniBar rates={funnelRates} />
    </div>
  );
}
