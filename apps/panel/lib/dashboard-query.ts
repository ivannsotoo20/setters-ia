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
 * Alertas de conversación (2026-09-03).
 *
 * Las tres detecciones de abajo miden desde el ÚLTIMO MENSAJE de la
 * conversación y quién lo escribió, no desde el último cambio de fase. La
 * versión anterior ("bottleneck") agrupaba por la fecha del último
 * `phase_change`, y como F1→F2 salta con el primer mensaje de la persona, F2
 * acumulaba a todo el que había contestado una vez: la alerta del tenant 7
 * decía 31 cuando las atribuibles eran 3.
 *
 * Son funciones puras: el caller carga `lastMessages` con
 * `loadLastMessageBySource` (dashboard-loader.ts) y pasa `now` en los tests.
 */

export type MessageSource = 'lead' | 'ai' | 'human' | 'system';

export interface LastMessageInfo {
  /** Quién escribió el último mensaje de la conversación. */
  source: MessageSource;
  sentAt: string;
  /** Último mensaje de la entrenadora (`source='human'`), o null si nunca escribió. */
  lastHumanAt: string | null;
}

/**
 * Conversaciones de prueba: las de Iván. Se identifican por el `first_name`
 * del lead ('Ivan' / 'Iván', sin distinguir mayúsculas ni acentos). La otra
 * marca posible —que el primer mensaje contenga 'fyzontest'— exigiría cargar
 * el contenido de los mensajes de todas las conversaciones vigiladas, así que
 * no se aplica.
 */
export function isTestLeadName(firstName: string | null | undefined): boolean {
  if (!firstName) return false;
  const normalized = firstName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  return normalized === 'ivan';
}

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 3600000;
}

function isTestConv(conv: ConvSnapshot, testLeadIds: Set<number> | undefined): boolean {
  return testLeadIds != null && conv.lead_id != null && testLeadIds.has(conv.lead_id);
}

/**
 * Conversación en la que el setter sigue al mando: activa, sin handoff a la
 * entrenadora y sin la IA pausada. Base común de "sin respuesta de la persona"
 * y de "esperando respuesta".
 */
function isSetterOwned(conv: ConvSnapshot): boolean {
  if (conv.state !== 'active') return false;
  if (conv.is_handoff_to_human) return false;
  if (conv.ai_paused_until != null) return false;
  return true;
}

export interface StallInput {
  channel: ChannelKey;
  phase: number;
  count: number;
  /**
   * Días del que menos lleva sin contestar dentro del grupo: "llevan más de N
   * días" es cierto para todos los contados.
   */
  daysStuckMin: number;
  daysStuckMax: number;
}

/**
 * "Sin respuesta de la persona": conversaciones activas, sin outcome, sin
 * handoff ni pausa, cuyo último mensaje es del setter (`source='ai'`) y lleva
 * ≥ `daysThreshold` días sin contestación. Agrupadas por (canal × fase actual
 * `phase_number`, F1–F6); solo salen los grupos con ≥ `countThreshold`.
 */
export function detectStalls(input: {
  convs: ConvSnapshot[];
  lastMessages: Map<number, LastMessageInfo>;
  channelMap: Map<number, ChannelInfo>;
  daysThreshold: number;
  countThreshold: number;
  /** Conversaciones con un outcome aplicado (etiqueta de bucket): ya salieron del embudo. */
  outcomeConvIds?: Set<number>;
  testLeadIds?: Set<number>;
  now?: Date;
}): StallInput[] {
  const now = input.now ?? new Date();
  const buckets = new Map<string, { count: number; daysMin: number; daysMax: number }>();
  for (const conv of input.convs) {
    if (!isSetterOwned(conv)) continue;
    if (input.outcomeConvIds?.has(conv.id)) continue;
    if (isTestConv(conv, input.testLeadIds)) continue;
    const last = input.lastMessages.get(conv.id);
    if (!last || last.source !== 'ai') continue;
    const days = Math.floor(hoursSince(last.sentAt, now) / 24);
    if (days < input.daysThreshold) continue;
    const phase = conv.phase_number;
    if (!Number.isFinite(phase) || phase < 1 || phase > 6) continue;
    const channelKey = classifyChannel(input.channelMap.get(conv.channel_id), conv.direction);
    if (!channelKey) continue;
    const k = `${channelKey}:${phase}`;
    const existing = buckets.get(k);
    buckets.set(k, {
      count: (existing?.count ?? 0) + 1,
      daysMin: Math.min(existing?.daysMin ?? Infinity, days),
      daysMax: Math.max(existing?.daysMax ?? 0, days),
    });
  }

  const out: StallInput[] = [];
  for (const [k, v] of buckets.entries()) {
    if (v.count < input.countThreshold) continue;
    const [channel, phaseStr] = k.split(':');
    out.push({
      channel: channel as ChannelKey,
      phase: parseInt(phaseStr!, 10),
      count: v.count,
      daysStuckMin: v.daysMin,
      daysStuckMax: v.daysMax,
    });
  }
  return out;
}

export interface WaitingResult {
  count: number;
  /** Horas que lleva esperando la que más lleva (0 si no hay ninguna). */
  hoursWaitingMax: number;
  convIds: number[];
}

/**
 * "Esperando respuesta": conversaciones en manos del setter cuyo último
 * mensaje es de la persona y nadie —ni la IA ni la entrenadora— ha contestado
 * en más de `hoursThreshold` horas. Que el último mensaje sea de la persona ya
 * implica que no hay ninguno de `ai` ni de `human` detrás.
 */
export function detectAwaitingReply(input: {
  convs: ConvSnapshot[];
  lastMessages: Map<number, LastMessageInfo>;
  hoursThreshold: number;
  testLeadIds?: Set<number>;
  now?: Date;
}): WaitingResult {
  const now = input.now ?? new Date();
  const convIds: number[] = [];
  let hoursMax = 0;
  for (const conv of input.convs) {
    if (!isSetterOwned(conv)) continue;
    if (isTestConv(conv, input.testLeadIds)) continue;
    const last = input.lastMessages.get(conv.id);
    if (!last || last.source !== 'lead') continue;
    const hours = hoursSince(last.sentAt, now);
    if (hours <= input.hoursThreshold) continue;
    convIds.push(conv.id);
    hoursMax = Math.max(hoursMax, hours);
  }
  return { count: convIds.length, hoursWaitingMax: hoursMax, convIds };
}

/**
 * "Handoffs sin atender": conversaciones pasadas a la entrenadora
 * (`is_handoff_to_human=true`) cuyo último mensaje es de la persona o del
 * setter y llevan más de `hoursThreshold` horas sin un mensaje suyo detrás.
 *
 * No se filtra por `state`: el motor cierra la conversación para el bot al
 * hacer el handoff (`state='closed'`) y sigue abierta para la entrenadora, así
 * que el caller las carga por el flag y no por el estado. Se excluye F7 (cita
 * agendada): ese handoff no espera ninguna respuesta por chat.
 */
export function detectUnattendedHandoffs(input: {
  convs: ConvSnapshot[];
  lastMessages: Map<number, LastMessageInfo>;
  hoursThreshold: number;
  testLeadIds?: Set<number>;
  now?: Date;
}): WaitingResult {
  const now = input.now ?? new Date();
  const convIds: number[] = [];
  let hoursMax = 0;
  for (const conv of input.convs) {
    if (!conv.is_handoff_to_human) continue;
    if (conv.phase_number === 7) continue;
    if (isTestConv(conv, input.testLeadIds)) continue;
    const last = input.lastMessages.get(conv.id);
    if (!last || (last.source !== 'lead' && last.source !== 'ai')) continue;
    if (last.lastHumanAt && Date.parse(last.lastHumanAt) >= Date.parse(last.sentAt)) continue;
    const hours = hoursSince(last.sentAt, now);
    if (hours <= input.hoursThreshold) continue;
    convIds.push(conv.id);
    hoursMax = Math.max(hoursMax, hours);
  }
  return { count: convIds.length, hoursWaitingMax: hoursMax, convIds };
}
