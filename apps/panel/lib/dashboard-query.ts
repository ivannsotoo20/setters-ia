/**
 * Sprint Lambda — Matriz canal × etapa para el dashboard.
 *
 * Genera la tabla 5 etapas × 5 columnas (4 canales + Total) con count + WoW%
 * + intensidad para heatmap (normalizada por max de cada fila).
 *
 * Sin deps de DB; el caller pasa events + convs + channelMap.
 */

import type { PipelineEvent } from './pipeline-metrics';
import { isBookedAppointment, type AppointmentSnapshot, type ConvSnapshot } from './dashboard-metrics';
import { isKeywordFlowOpening } from './inbound-opening';

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
  key: 'leads' | 'active' | 'qualified' | 'link_sent' | 'scheduled' | 'won';
  label: string;
  cells: Record<MatrixColumnKey, MatrixCell>;
}

export interface MatrixData {
  rows: MatrixRow[];
}

// 2026-09-12: "Agendados" (F6/F7) pasa a llamarse lo que es, "Enlaces enviados",
// y "Citas agendadas" cuenta reservas reales del calendario vinculado.
const ROW_DEFS: Array<{ key: MatrixRow['key']; label: string }> = [
  { key: 'leads', label: 'Leads totales' },
  { key: 'active', label: 'Conversaciones activas' },
  { key: 'qualified', label: 'Cualificados' },
  { key: 'link_sent', label: 'Enlaces enviados' },
  { key: 'scheduled', label: 'Citas agendadas' },
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

/**
 * Conversaciones distintas con una cita viva, por canal. El canal es el de la
 * conversación casada (`channel_id` + `direction` vienen en el snapshot de la
 * cita); una cita sin conversación no tiene canal y no cuenta aquí.
 */
function countScheduledInChannel(
  appointments: AppointmentSnapshot[],
  channelMap: Map<number, ChannelInfo>,
  channelKey: ChannelKey,
): number {
  const ids = new Set<number>();
  for (const a of appointments) {
    if (!isBookedAppointment(a) || a.conversation_id == null || a.channel_id == null) continue;
    if (classifyChannel(channelMap.get(Number(a.channel_id)), String(a.direction ?? '')) !== channelKey) {
      continue;
    }
    ids.add(Number(a.conversation_id));
  }
  return ids.size;
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
  /** Citas del calendario vinculado reservadas en cada ventana (fila "Citas agendadas"). */
  appointments?: AppointmentSnapshot[];
  prevAppointments?: AppointmentSnapshot[];
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
    } else if (key === 'link_sent') {
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
    } else if (key === 'scheduled') {
      for (const ck of ALL_CHANNEL_KEYS) {
        values[ck] = countScheduledInChannel(input.appointments ?? [], input.channelMap, ck);
        prevValues[ck] = countScheduledInChannel(input.prevAppointments ?? [], input.channelMap, ck);
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
 * Alertas de conversación (2026-09-03; a SQL el 2026-11-04).
 *
 * Las detecciones de abajo miden desde el ÚLTIMO MENSAJE de la conversación y
 * quién lo escribió, no desde el último cambio de fase. La versión anterior
 * ("bottleneck") agrupaba por la fecha del último `phase_change`, y como F1→F2
 * salta con el primer mensaje de la persona, F2 acumulaba a todo el que había
 * contestado una vez: la alerta del tenant 7 decía 31 cuando las atribuibles
 * eran 3.
 *
 * Desde 2026-11-04 el último mensaje por conversación y las cuatro listas las
 * calcula la base de datos: la RPC `dashboard_alerts` (migración 085). Antes el
 * panel cargaba todas las conversaciones activas del tenant, PostgREST cortaba
 * la respuesta en 1.000 filas arbitrarias (el tenant 7 tiene 4.181) y las
 * alertas salían de ese subconjunto: «11 personas esperando respuesta» cuando
 * eran 34. Las funciones de aquí reciben las filas de la RPC
 * (`loadDashboardAlerts` en dashboard-loader.ts) y dejan en JS lo que no vive en
 * SQL: el umbral de horas (el mismo que recibe la RPC), las horas de espera, la
 * agrupación por canal × fase de los atascos y, en los inbound, el filtro de
 * apertura de palabra clave (`isKeywordFlowOpening`, lib/inbound-opening.ts),
 * que es la misma regla que usa la tarjeta «Inbound» del dashboard.
 *
 * Son funciones puras: el caller pasa `now` en los tests.
 */

export type MessageSource = 'lead' | 'ai' | 'human' | 'system';

/**
 * Conversaciones de prueba: las de Iván. Se identifican por el `first_name`
 * del lead ('Ivan' / 'Iván', sin distinguir mayúsculas ni acentos). La RPC
 * aplica el mismo criterio en SQL (`lower(btrim(first_name)) IN ('ivan','iván')`);
 * esta función queda como definición documentada y para quien lo necesite en
 * JS. La otra marca posible —que el primer mensaje contenga 'fyzontest'—
 * exigiría cargar el contenido de los mensajes, así que no se aplica.
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

/** Una conversación de una lista de la RPC: su id y cuándo fue el último mensaje. */
export interface AlertConvRow {
  conversation_id: number;
  /** `sent_at` del último mensaje de la conversación. */
  last_message_at: string;
}

/** Atasco candidato: conversación activa cuyo último mensaje es de la IA y lleva días. */
export interface StallConvRow extends AlertConvRow {
  channel_id: number;
  direction: string;
  phase_number: number;
}

/** Inbound con la IA pausada por el gate de palabras clave, con su apertura. */
export interface InboundUnattendedRow extends AlertConvRow {
  /** Primer mensaje de la persona (recortado a 160 caracteres), o null si fue solo media. */
  first_lead_text: string | null;
  first_lead_at: string | null;
  /** Primer mensaje automático nuestro (`source='system'`) tras el primero de la persona. */
  first_auto_reply_at: string | null;
}

/** Resultado tipado de la RPC `dashboard_alerts` (migración 085). */
export interface DashboardAlertsRpcResult {
  computedAt: string | null;
  awaitingReply: AlertConvRow[];
  handoffUnattended: AlertConvRow[];
  stalls: StallConvRow[];
  inboundUnattended: InboundUnattendedRow[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.map(asRecord).filter((r): r is Record<string, unknown> => r != null);
}

function numberOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function baseRow(r: Record<string, unknown>): AlertConvRow | null {
  const id = numberOf(r.conversation_id);
  const at = stringOrNull(r.last_message_at);
  if (id == null || at == null || !Number.isFinite(Date.parse(at))) return null;
  return { conversation_id: id, last_message_at: at };
}

/**
 * Convierte el jsonb de la RPC en filas tipadas. Tolerante: una lista que no
 * venga o una fila sin id o sin fecha se descarta, nunca rompe el dashboard.
 */
export function parseDashboardAlertsRpc(raw: unknown): DashboardAlertsRpcResult {
  const obj = asRecord(raw) ?? {};
  const awaitingReply: AlertConvRow[] = [];
  for (const r of asArray(obj.awaiting_reply)) {
    const row = baseRow(r);
    if (row) awaitingReply.push(row);
  }
  const handoffUnattended: AlertConvRow[] = [];
  for (const r of asArray(obj.handoff_unattended)) {
    const row = baseRow(r);
    if (row) handoffUnattended.push(row);
  }
  const stalls: StallConvRow[] = [];
  for (const r of asArray(obj.stalls)) {
    const row = baseRow(r);
    const channelId = numberOf(r.channel_id);
    const phase = numberOf(r.phase_number);
    if (!row || channelId == null || phase == null) continue;
    stalls.push({
      ...row,
      channel_id: channelId,
      direction: typeof r.direction === 'string' ? r.direction : 'untagged',
      phase_number: phase,
    });
  }
  const inboundUnattended: InboundUnattendedRow[] = [];
  for (const r of asArray(obj.inbound_unattended)) {
    const row = baseRow(r);
    if (!row) continue;
    inboundUnattended.push({
      ...row,
      first_lead_text: typeof r.first_lead_text === 'string' ? r.first_lead_text : null,
      first_lead_at: stringOrNull(r.first_lead_at),
      first_auto_reply_at: stringOrNull(r.first_auto_reply_at),
    });
  }
  return {
    computedAt: stringOrNull(obj.computed_at),
    awaitingReply,
    handoffUnattended,
    stalls,
    inboundUnattended,
  };
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
 * ≥ `daysThreshold` días sin contestación. La RPC ya devuelve solo las que
 * cumplen estado, pausa, handoff, F1–F6 y días; aquí se quitan las que tienen
 * un outcome aplicado, se agrupan por (canal × fase actual) y solo salen los
 * grupos con ≥ `countThreshold`.
 */
export function detectStalls(input: {
  rows: readonly StallConvRow[];
  channelMap: Map<number, ChannelInfo>;
  daysThreshold: number;
  countThreshold: number;
  /** Conversaciones con un outcome aplicado (etiqueta de bucket): ya salieron del embudo. */
  outcomeConvIds?: Set<number>;
  now?: Date;
}): StallInput[] {
  const now = input.now ?? new Date();
  const buckets = new Map<string, { count: number; daysMin: number; daysMax: number }>();
  for (const row of input.rows) {
    if (input.outcomeConvIds?.has(row.conversation_id)) continue;
    const days = Math.floor(hoursSince(row.last_message_at, now) / 24);
    if (days < input.daysThreshold) continue;
    const phase = row.phase_number;
    if (!Number.isFinite(phase) || phase < 1 || phase > 6) continue;
    const channelKey = classifyChannel(input.channelMap.get(row.channel_id), row.direction);
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
  /** Ordenadas de la que más lleva esperando a la que menos. */
  convIds: number[];
}

function waitingFromRows(
  rows: readonly AlertConvRow[],
  hoursThreshold: number,
  now: Date,
): WaitingResult {
  const kept: Array<{ id: number; hours: number }> = [];
  for (const row of rows) {
    const hours = hoursSince(row.last_message_at, now);
    if (hours <= hoursThreshold) continue;
    kept.push({ id: row.conversation_id, hours });
  }
  kept.sort((a, b) => b.hours - a.hours);
  return {
    count: kept.length,
    hoursWaitingMax: kept[0]?.hours ?? 0,
    convIds: kept.map((k) => k.id),
  };
}

/**
 * "Esperando respuesta": conversaciones en manos del setter (activas, sin
 * handoff, IA sin pausar) cuyo último mensaje es de la persona y nadie —ni la
 * IA ni la entrenadora— ha contestado en más de `hoursThreshold` horas. Que el
 * último mensaje sea de la persona ya implica que no hay ninguno de `ai` ni de
 * `human` detrás. Esas condiciones las aplica la RPC; aquí se repasa el umbral
 * (el mismo número que recibió la RPC) y se calculan las horas.
 */
export function detectAwaitingReply(input: {
  rows: readonly AlertConvRow[];
  hoursThreshold: number;
  now?: Date;
}): WaitingResult {
  return waitingFromRows(input.rows, input.hoursThreshold, input.now ?? new Date());
}

/**
 * "Handoffs sin atender": conversaciones pasadas a la entrenadora
 * (`is_handoff_to_human=true`, F7 excluida: ese handoff no espera ninguna
 * respuesta por chat) cuyo último mensaje es de la persona o del setter y
 * llevan más de `hoursThreshold` horas sin un mensaje suyo detrás. Sin filtro
 * por `state`: el motor cierra la conversación para el bot al hacer el handoff
 * (`state='closed'`) y sigue abierta para la entrenadora. Esas condiciones las
 * aplica la RPC; aquí el umbral y las horas.
 */
export function detectUnattendedHandoffs(input: {
  rows: readonly AlertConvRow[];
  hoursThreshold: number;
  now?: Date;
}): WaitingResult {
  return waitingFromRows(input.rows, input.hoursThreshold, input.now ?? new Date());
}

/**
 * "Te escribieron y la IA no las atiende" (2026-11-04, Tania): conversaciones
 * que abrió la persona (`direction='inbound'`), activas, sin handoff, con la IA
 * pausada por el gate de palabras clave (`ai_paused_until='infinity'`) y cuyo
 * último mensaje es suyo. Caían entre las otras dos alertas: no son «esperando
 * respuesta» (exige IA sin pausar) ni «en manos de la entrenadora» (exige
 * handoff), y nadie las atendía.
 *
 * La RPC aplica esas condiciones, deja fuera las de prueba y las que llevan la
 * etiqueta «Profesional». Aquí se descartan las que empezaron como el flujo de
 * una palabra clave («Siii😊», «Empezar», «espalda»…) con `isKeywordFlowOpening`:
 * la misma regla que decide qué es un inbound en la tarjeta del dashboard. Sin
 * umbral de horas: con la IA pausada nadie va a contestar, da igual cuánto lleve.
 */
export function detectInboundUnattended(input: {
  rows: readonly InboundUnattendedRow[];
  /** Palabras clave del tenant (`automation_keywords.pattern`), activas o no. */
  keywordPatterns: readonly string[];
  now?: Date;
}): WaitingResult {
  const kept = input.rows.filter(
    (row) =>
      !isKeywordFlowOpening({
        firstLeadText: row.first_lead_text,
        firstLeadAt: row.first_lead_at,
        firstAutoReplyAt: row.first_auto_reply_at,
        keywordPatterns: input.keywordPatterns,
      }),
  );
  return waitingFromRows(kept, -Infinity, input.now ?? new Date());
}
