/**
 * Sprint Lambda — Matriz canal × etapa para el dashboard.
 *
 * Genera la tabla 5 etapas × 5 columnas (4 canales + Total) con count + WoW%
 * + intensidad para heatmap (normalizada por max de cada fila).
 *
 * Sin deps de DB; el caller pasa events + convs + channelMap.
 */

import type { PipelineEvent } from './pipeline-metrics';
import type { ConvSnapshot } from './dashboard-metrics';

export type ChannelKey = 'wa' | 'fb' | 'ig-in' | 'ig-out';
export type MatrixColumnKey = ChannelKey | 'total';

export const ALL_CHANNEL_KEYS: readonly ChannelKey[] = ['wa', 'fb', 'ig-in', 'ig-out'] as const;
export const ALL_MATRIX_COLUMNS: readonly MatrixColumnKey[] = [
  'wa',
  'fb',
  'ig-in',
  'ig-out',
  'total',
] as const;

export interface ChannelInfo {
  kind: 'whatsapp' | 'instagram_dm' | 'facebook_messenger' | string;
}

export interface MatrixCell {
  count: number;
  prevCount: number;
  deltaPct: number | null;
  intensity: number; // 0-1
}

export interface MatrixRow {
  key: 'leads' | 'active' | 'qualified' | 'scheduled' | 'won';
  label: string;
  cells: Record<MatrixColumnKey, MatrixCell>;
}

export interface MatrixData {
  rows: MatrixRow[];
}

const ROW_DEFS: Array<{ key: MatrixRow['key']; label: string }> = [
  { key: 'leads', label: 'Leads totales' },
  { key: 'active', label: 'Conversaciones activas' },
  { key: 'qualified', label: 'Cualificados' },
  { key: 'scheduled', label: 'Agendados' },
  { key: 'won', label: 'Ganados' },
];

export function classifyChannel(
  channelInfo: ChannelInfo | undefined,
  direction: string,
): ChannelKey | null {
  if (!channelInfo) return null;
  if (channelInfo.kind === 'whatsapp') return 'wa';
  if (channelInfo.kind === 'facebook_messenger') return 'fb';
  if (channelInfo.kind === 'instagram_dm') {
    if (direction === 'inbound') return 'ig-in';
    if (direction === 'outbound') return 'ig-out';
    return null;
  }
  return null;
}

function emptyChannelCounts(): Record<ChannelKey, number> {
  return { wa: 0, fb: 0, 'ig-in': 0, 'ig-out': 0 };
}

function bucketConvsByChannel(
  convs: ConvSnapshot[],
  channelMap: Map<number, ChannelInfo>,
): Record<ChannelKey, ConvSnapshot[]> {
  const out: Record<ChannelKey, ConvSnapshot[]> = {
    wa: [],
    fb: [],
    'ig-in': [],
    'ig-out': [],
  };
  for (const c of convs) {
    const ch = channelMap.get(c.channel_id);
    const key = classifyChannel(ch, c.direction);
    if (key) out[key].push(c);
  }
  return out;
}

function countActiveInChannel(convs: ConvSnapshot[], windowFromIso: string): number {
  const fromMs = Date.parse(windowFromIso);
  return convs.filter((c) => {
    if (c.state !== 'active') return false;
    if (!c.last_message_at) return false;
    return Date.parse(c.last_message_at) >= fromMs;
  }).length;
}

function countByEventTo(
  events: PipelineEvent[],
  toValues: string[],
  convs: ConvSnapshot[],
  channelMap: Map<number, ChannelInfo>,
  channelKey: ChannelKey,
): number {
  // Filtra events cuya conv pertenezca al canal indicado
  const convIdToChannel = new Map<number, ChannelKey | null>();
  for (const c of convs) {
    convIdToChannel.set(c.id, classifyChannel(channelMap.get(c.channel_id), c.direction));
  }
  const ids = new Set<number>();
  for (const e of events) {
    if (e.event_type !== 'phase_change') continue;
    if (!toValues.includes(e.to_value)) continue;
    if (convIdToChannel.get(e.conversation_id) !== channelKey) continue;
    ids.add(e.conversation_id);
  }
  return ids.size;
}

function countOutcomeInChannel(
  events: PipelineEvent[],
  bucket: string,
  convs: ConvSnapshot[],
  channelMap: Map<number, ChannelInfo>,
  channelKey: ChannelKey,
): number {
  const convIdToChannel = new Map<number, ChannelKey | null>();
  for (const c of convs) {
    convIdToChannel.set(c.id, classifyChannel(channelMap.get(c.channel_id), c.direction));
  }
  let count = 0;
  for (const e of events) {
    if (e.event_type !== 'outcome_applied') continue;
    if (e.to_value !== bucket) continue;
    if (convIdToChannel.get(e.conversation_id) !== channelKey) continue;
    count += 1;
  }
  return count;
}

function withDeltaAndIntensity(
  values: Record<MatrixColumnKey, number>,
  prevValues: Record<MatrixColumnKey, number>,
): Record<MatrixColumnKey, MatrixCell> {
  const channelValues = ALL_CHANNEL_KEYS.map((k) => values[k]);
  const max = Math.max(0, ...channelValues);
  const result = {} as Record<MatrixColumnKey, MatrixCell>;
  for (const k of ALL_MATRIX_COLUMNS) {
    const count = values[k];
    const prev = prevValues[k];
    const deltaPct = prev > 0 ? (count - prev) / prev : null;
    const intensity = k === 'total' ? 0 : max > 0 ? count / max : 0;
    result[k] = { count, prevCount: prev, deltaPct, intensity };
  }
  return result;
}

export function aggregateMatrix(input: {
  events: PipelineEvent[];
  convs: ConvSnapshot[];
  prevEvents: PipelineEvent[];
  prevConvs: ConvSnapshot[];
  channelMap: Map<number, ChannelInfo>;
  windowFromIso: string;
  prevWindowFromIso: string;
}): MatrixData {
  const cur = bucketConvsByChannel(input.convs, input.channelMap);
  const prev = bucketConvsByChannel(input.prevConvs, input.channelMap);

  function buildRow(key: MatrixRow['key']): MatrixRow {
    const values: Record<MatrixColumnKey, number> = {
      wa: 0,
      fb: 0,
      'ig-in': 0,
      'ig-out': 0,
      total: 0,
    };
    const prevValues = { ...values };

    if (key === 'leads') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = cur[ck].length;
        prevValues[ck] = prev[ck].length;
      }
    } else if (key === 'active') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = countActiveInChannel(cur[ck], input.windowFromIso);
        prevValues[ck] = countActiveInChannel(prev[ck], input.prevWindowFromIso);
      }
    } else if (key === 'qualified') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = countByEventTo(
          input.events,
          ['5'],
          input.convs,
          input.channelMap,
          ck,
        );
        prevValues[ck] = countByEventTo(
          input.prevEvents,
          ['5'],
          input.prevConvs,
          input.channelMap,
          ck,
        );
      }
    } else if (key === 'scheduled') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = countByEventTo(
          input.events,
          ['6', '7'],
          input.convs,
          input.channelMap,
          ck,
        );
        prevValues[ck] = countByEventTo(
          input.prevEvents,
          ['6', '7'],
          input.prevConvs,
          input.channelMap,
          ck,
        );
      }
    } else if (key === 'won') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = countOutcomeInChannel(
          input.events,
          'bought',
          input.convs,
          input.channelMap,
          ck,
        );
        prevValues[ck] = countOutcomeInChannel(
          input.prevEvents,
          'bought',
          input.prevConvs,
          input.channelMap,
          ck,
        );
      }
    }
    values.total = ALL_CHANNEL_KEYS.reduce((s, k) => s + values[k], 0);
    prevValues.total = ALL_CHANNEL_KEYS.reduce((s, k) => s + prevValues[k], 0);

    return {
      key,
      label: ROW_DEFS.find((r) => r.key === key)!.label,
      cells: withDeltaAndIntensity(values, prevValues),
    };
  }

  return { rows: ROW_DEFS.map((d) => buildRow(d.key)) };
}

/**
 * Detecta bottlenecks (stuck leads) por (channel × phase).
 * Devuelve {channel, phase, count, daysStuckMin} para cada combo con count >= threshold.
 *
 * Lógica: por cada conv activa cuya última `phase_change` event sea hace > daysThreshold,
 * agruparla por (channel, last_phase) y contar.
 */
export interface BottleneckInput {
  channel: ChannelKey;
  phase: number;
  count: number;
  daysStuckMax: number;
}

export function detectBottlenecks(input: {
  allRecentEvents: PipelineEvent[];
  convs: ConvSnapshot[];
  channelMap: Map<number, ChannelInfo>;
  daysThreshold: number;
  countThreshold: number;
  now?: Date;
}): BottleneckInput[] {
  const now = input.now ?? new Date();
  // last phase_change event por conv
  const lastEventByConv = new Map<number, PipelineEvent>();
  for (const e of input.allRecentEvents) {
    if (e.event_type !== 'phase_change') continue;
    const prev = lastEventByConv.get(e.conversation_id);
    if (!prev || Date.parse(e.occurred_at) > Date.parse(prev.occurred_at)) {
      lastEventByConv.set(e.conversation_id, e);
    }
  }

  // outcomes (cualquier outcome) → excluir conv (ya no está estancada, salió)
  const convsWithOutcome = new Set<number>();
  for (const e of input.allRecentEvents) {
    if (e.event_type === 'outcome_applied') convsWithOutcome.add(e.conversation_id);
  }

  const buckets = new Map<string, { count: number; daysMax: number }>();
  for (const conv of input.convs) {
    if (conv.state !== 'active') continue;
    if (convsWithOutcome.has(conv.id)) continue;
    const lastEvent = lastEventByConv.get(conv.id);
    if (!lastEvent) continue;
    const phase = parseInt(lastEvent.to_value, 10);
    if (!Number.isFinite(phase) || phase < 1 || phase > 6) continue;
    const daysStuck = Math.floor((now.getTime() - Date.parse(lastEvent.occurred_at)) / 86400000);
    if (daysStuck < input.daysThreshold) continue;
    const channelKey = classifyChannel(input.channelMap.get(conv.channel_id), conv.direction);
    if (!channelKey) continue;
    const k = `${channelKey}:${phase}`;
    const existing = buckets.get(k) ?? { count: 0, daysMax: 0 };
    buckets.set(k, {
      count: existing.count + 1,
      daysMax: Math.max(existing.daysMax, daysStuck),
    });
  }

  const out: BottleneckInput[] = [];
  for (const [k, v] of buckets.entries()) {
    if (v.count < input.countThreshold) continue;
    const [channel, phaseStr] = k.split(':');
    out.push({
      channel: channel as ChannelKey,
      phase: parseInt(phaseStr!, 10),
      count: v.count,
      daysStuckMax: v.daysMax,
    });
  }
  return out;
}
