/**
 * Sprint Lambda — Serie temporal para gráfico tendencia.
 *
 * Agrega leads creados por día/semana/mes según granularity, breakdown por
 * canal (4 series stacked) + tasa cualificación overlay.
 *
 * Sin deps de DB.
 */

import type { PipelineEvent } from './pipeline-metrics';
import type { ConvSnapshot } from './dashboard-metrics';
import { classifyChannel, ALL_CHANNEL_KEYS, type ChannelInfo } from './dashboard-query';

export type Granularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  date: string; // ISO 'YYYY-MM-DD' / 'YYYY-Www' / 'YYYY-MM'
  byChannel: { wa: number; fb: number; igIn: number; igOut: number };
  total: number;
  qualifiedRate: number | null; // 0-1 o null si total=0
}

export function pickGranularity(windowDays: number): Granularity {
  if (windowDays > 180) return 'month';
  if (windowDays > 60) return 'week';
  return 'day';
}

function bucketKey(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (granularity === 'day') return `${yyyy}-${mm}-${dd}`;
  if (granularity === 'month') return `${yyyy}-${mm}`;
  // week: ISO 8601 week number (Mon-based)
  const target = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday in current week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function bucketIterator(fromIso: string, toIso: string, granularity: Granularity): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() <= end.getTime()) {
    const key = bucketKey(cursor.toISOString(), granularity);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    if (granularity === 'day') {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else if (granularity === 'week') {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return out;
}

export function aggregateTrend(input: {
  events: PipelineEvent[];
  convs: ConvSnapshot[];
  channelMap: Map<number, ChannelInfo>;
  fromIso: string;
  toIso: string;
  granularity: Granularity;
}): TrendPoint[] {
  const buckets = bucketIterator(input.fromIso, input.toIso, input.granularity);
  const points = new Map<string, TrendPoint>();
  for (const key of buckets) {
    points.set(key, {
      date: key,
      byChannel: { wa: 0, fb: 0, igIn: 0, igOut: 0 },
      total: 0,
      qualifiedRate: null,
    });
  }

  // Mapa convId → canal, para event aggregation.
  const convIdToChannel = new Map<number, ReturnType<typeof classifyChannel>>();
  for (const c of input.convs) {
    convIdToChannel.set(c.id, classifyChannel(input.channelMap.get(c.channel_id), c.direction));
  }

  // Leads por día = convs.created_at bucket
  for (const c of input.convs) {
    const key = bucketKey(c.created_at, input.granularity);
    const point = points.get(key);
    if (!point) continue;
    const ch = convIdToChannel.get(c.id);
    if (ch === 'wa') point.byChannel.wa += 1;
    else if (ch === 'fb') point.byChannel.fb += 1;
    else if (ch === 'ig-in') point.byChannel.igIn += 1;
    else if (ch === 'ig-out') point.byChannel.igOut += 1;
    point.total += 1;
  }

  // Cualificación: por bucket, distinct convs con phase_change to_value=5
  const qualifiedByBucket = new Map<string, Set<number>>();
  for (const e of input.events) {
    if (e.event_type !== 'phase_change' || e.to_value !== '5') continue;
    const key = bucketKey(e.occurred_at, input.granularity);
    if (!points.has(key)) continue;
    const set = qualifiedByBucket.get(key) ?? new Set<number>();
    set.add(e.conversation_id);
    qualifiedByBucket.set(key, set);
  }
  for (const [key, set] of qualifiedByBucket.entries()) {
    const point = points.get(key);
    if (!point) continue;
    point.qualifiedRate = point.total > 0 ? set.size / point.total : null;
  }

  return buckets.map((k) => points.get(k)!);
}

export const _internal = { bucketKey, bucketIterator, ALL_CHANNEL_KEYS };
