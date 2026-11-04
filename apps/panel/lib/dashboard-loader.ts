import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentSnapshot, ConvSnapshot } from './dashboard-metrics';
import {
  parseDashboardAlertsRpc,
  type ChannelInfo,
  type ChannelKey,
  type DashboardAlertsRpcResult,
} from './dashboard-query';
import type { PipelineEvent } from './pipeline-metrics';
import { isKeywordFlowOpening } from './inbound-opening';

/**
 * Carga compartida del dashboard (2026-09-02).
 *
 * Nació con el drill-down: la lista de personas detrás de una métrica tiene que
 * salir de los MISMOS datos que el número de la tarjeta, así que las piezas de
 * carga que antes vivían dentro de `loadDashboardData` se sacan aquí para que
 * las use también `listWidgetMembers`. Sin deps de Next; solo Supabase.
 */

export type ChannelFilter = 'all' | ChannelKey;

/**
 * Columnas de `conversations` que forman un `ConvSnapshot`. Incluye
 * `conversation_source` desde 2026-09-02: las métricas de outbound distinguen
 * bienvenida de palabra clave por ese campo. Y desde 2026-09-03 `lead_id`,
 * `ai_paused_until` e `is_handoff_to_human`: las alertas de conversación
 * dejan fuera lo pausado, lo pasado a la entrenadora y las pruebas de Iván.
 */
export const CONV_SNAPSHOT_SELECT =
  'id, state, is_qualified, phase_number, channel_id, direction, last_message_at, created_at, conversation_source, lead_id, ai_paused_until, is_handoff_to_human';

export async function loadChannelMap(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<{ channelMap: Map<number, ChannelInfo>; error: string | null }> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, channel_type')
    .eq('tenant_id', tenantId);
  if (error) return { channelMap: new Map(), error: error.message };
  const channelMap = new Map<number, ChannelInfo>();
  for (const c of data ?? []) channelMap.set(Number(c.id), { kind: String(c.channel_type) });
  return { channelMap, error: null };
}

/**
 * Traduce el filtro global de canal del dashboard a (ids de canal, dirección).
 * 'ig-in' / 'ig-out' son el mismo canal de Instagram partido por quién abrió.
 */
export function resolveChannelFilter(
  channelKey: ChannelFilter,
  channelMap: Map<number, ChannelInfo>,
): { channelIds: number[] | null; direction: 'inbound' | 'outbound' | null } {
  if (channelKey === 'all') return { channelIds: null, direction: null };
  const ids: number[] = [];
  let direction: 'inbound' | 'outbound' | null = null;
  for (const [id, info] of channelMap.entries()) {
    if (channelKey === 'wa' && info.kind === 'whatsapp') ids.push(id);
    else if (channelKey === 'fb' && info.kind === 'facebook_messenger') ids.push(id);
    else if ((channelKey === 'ig-in' || channelKey === 'ig-out') && info.kind === 'instagram_dm') {
      ids.push(id);
    }
  }
  if (channelKey === 'ig-in') direction = 'inbound';
  else if (channelKey === 'ig-out') direction = 'outbound';
  return { channelIds: ids, direction };
}

export async function loadWindowConvs(
  supabase: SupabaseClient,
  params: {
    tenantId: number;
    fromIso: string;
    toIso: string;
    channelIds: number[] | null;
    direction: 'inbound' | 'outbound' | null;
  },
): Promise<{ convs: ConvSnapshot[]; error: string | null }> {
  let q = supabase
    .from('conversations')
    .select(CONV_SNAPSHOT_SELECT)
    .eq('tenant_id', params.tenantId)
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso);
  if (params.channelIds && params.channelIds.length > 0) q = q.in('channel_id', params.channelIds);
  if (params.direction) q = q.eq('direction', params.direction);
  const { data, error } = await q;
  if (error) return { convs: [], error: error.message };
  return { convs: (data ?? []) as unknown as ConvSnapshot[], error: null };
}

export async function loadWindowEvents(
  supabase: SupabaseClient,
  params: { tenantId: number; fromIso: string; toIso: string },
): Promise<{ events: PipelineEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('pipeline_events')
    .select('event_type, from_value, to_value, source, occurred_at, conversation_id')
    .eq('tenant_id', params.tenantId)
    .gte('occurred_at', params.fromIso)
    .lte('occurred_at', params.toIso);
  if (error) return { events: [], error: error.message };
  return { events: (data ?? []) as PipelineEvent[], error: null };
}

/**
 * Citas del calendario vinculado RESERVADAS en la ventana (`booked_at`), con el
 * canal y la dirección de la conversación casada para poder situarlas en el
 * mismo filtro de canal que el resto del dashboard. Es la fuente de "Citas
 * agendadas" (2026-09-12); antes ese número era el proxy F6/F7.
 *
 * Se filtra por `booked_at` y no por `received_at` porque el calendar-sync del
 * motor trae citas de días atrás y el backfill inicial las traería todas hoy.
 *
 * El embed de `conversations` lleva el hint `!conversation_id` porque entre las
 * dos tablas hay DOS claves foráneas (`calendar_appointments.conversation_id` y
 * `conversations.last_appointment_id`, migrations 048/049) y PostgREST no elige
 * sola: sin el hint responde PGRST201 y el dashboard entero cae (2026-09-20).
 */
export async function loadWindowAppointments(
  supabase: SupabaseClient,
  params: {
    tenantId: number;
    fromIso: string;
    toIso: string;
    channelIds: number[] | null;
    direction: 'inbound' | 'outbound' | null;
  },
): Promise<{ appointments: AppointmentSnapshot[]; error: string | null }> {
  const { data, error } = await supabase
    .from('calendar_appointments')
    .select(
      'id, conversation_id, lead_id, appointment_status, booked_at, start_at, conversations!conversation_id(channel_id, direction)',
    )
    .eq('tenant_id', params.tenantId)
    .gte('booked_at', params.fromIso)
    .lte('booked_at', params.toIso);
  if (error) return { appointments: [], error: error.message };

  const appointments: AppointmentSnapshot[] = [];
  for (const row of data ?? []) {
    const conv = (Array.isArray(row.conversations) ? row.conversations[0] : row.conversations) as
      | { channel_id: number | null; direction: string | null }
      | null
      | undefined;
    const channelId = conv?.channel_id != null ? Number(conv.channel_id) : null;
    const direction = conv?.direction ?? null;
    // El filtro global de canal se aplica sobre la conversación casada, igual
    // que en `loadWindowConvs`. Una cita sin conversación no pasa ningún filtro.
    if (params.channelIds && params.channelIds.length > 0) {
      if (channelId == null || !params.channelIds.includes(channelId)) continue;
    }
    if (params.direction && direction !== params.direction) continue;
    appointments.push({
      id: Number(row.id),
      conversation_id: row.conversation_id != null ? Number(row.conversation_id) : null,
      lead_id: row.lead_id != null ? Number(row.lead_id) : null,
      appointment_status: String(row.appointment_status ?? 'new'),
      booked_at: String(row.booked_at),
      start_at: String(row.start_at),
      channel_id: channelId,
      direction,
    });
  }
  return { appointments, error: null };
}

const REPLY_LOOKUP_CHUNK = 200;

/**
 * Rellena `has_lead_reply` en las conversaciones OUTBOUND (las que abrió la
 * entrenadora), que es donde tiene sentido preguntarse "¿contestó?". Muta el
 * array recibido.
 *
 * Se mira `conversation_messages` con `source='lead'`: las columnas
 * `first_lead_response_at` / `first_ai_message_at` existen en `conversations`
 * pero ningún camino del motor las escribe (0 pobladas en el tenant 7 el
 * 2026-09-02), así que no sirven de fuente. Se consulta por lotes de ids para
 * no reventar el límite de longitud de URL de PostgREST.
 */
export async function enrichWithLeadReplies(
  supabase: SupabaseClient,
  convs: ConvSnapshot[],
): Promise<{ error: string | null }> {
  const outbound = convs.filter((c) => c.direction === 'outbound');
  for (const c of outbound) c.has_lead_reply = false;
  if (outbound.length === 0) return { error: null };

  const ids = outbound.map((c) => c.id);
  const replied = new Set<number>();
  for (let i = 0; i < ids.length; i += REPLY_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + REPLY_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('conversation_id')
      .in('conversation_id', chunk)
      .eq('source', 'lead');
    if (error) return { error: error.message };
    for (const row of data ?? []) replied.add(Number(row.conversation_id));
  }
  for (const c of outbound) c.has_lead_reply = replied.has(c.id);
  return { error: null };
}

/**
 * Rellena `has_team_reply` en las conversaciones INBOUND (las que abrió la
 * persona escribiendo primero): ¿le contestó la entrenadora o la IA? Muta el
 * array recibido. Mismo troceo por lotes que `enrichWithLeadReplies`.
 *
 * 2026-10-20: un inbound sin palabra clave deja la IA en pausa y, si la
 * entrenadora no entra, nadie contesta (21 de 25 en el tenant 7 desde el 8 oct).
 * Este campo es lo que deja verlo en el dashboard.
 */
export async function enrichWithTeamReplies(
  supabase: SupabaseClient,
  convs: ConvSnapshot[],
): Promise<{ error: string | null }> {
  const inbound = convs.filter((c) => c.direction === 'inbound');
  for (const c of inbound) c.has_team_reply = false;
  if (inbound.length === 0) return { error: null };

  const ids = inbound.map((c) => c.id);
  const answered = new Set<number>();
  for (let i = 0; i < ids.length; i += REPLY_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + REPLY_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('conversation_id')
      .in('conversation_id', chunk)
      .in('source', ['ai', 'human']);
    if (error) return { error: error.message };
    for (const row of data ?? []) answered.add(Number(row.conversation_id));
  }
  for (const c of inbound) c.has_team_reply = answered.has(c.id);
  return { error: null };
}

const MESSAGE_PAGE_SIZE = 1000;

/**
 * Alertas de conversación calculadas en la base de datos: la RPC
 * `dashboard_alerts` (migración 085) devuelve en un solo jsonb las cuatro
 * listas —esperando respuesta, en manos de la entrenadora, atascos e inbound
 * que la IA no atiende— con sus ids. Sustituye a cargar todas las activas y
 * sus mensajes en el panel, que PostgREST cortaba en 1.000 filas (2026-11-04).
 *
 * Los umbrales se pasan desde `ALERT_THRESHOLDS` para que la fuente única siga
 * en TS; la RPC los tiene como default por si se llama a mano.
 */
export async function loadDashboardAlerts(
  supabase: SupabaseClient,
  params: {
    tenantId: number;
    awaitingHours: number;
    handoffHours: number;
    stallDays: number;
  },
): Promise<{ alerts: DashboardAlertsRpcResult; error: string | null }> {
  const empty = parseDashboardAlertsRpc(null);
  const { data, error } = await supabase.rpc('dashboard_alerts', {
    p_tenant_id: params.tenantId,
    p_awaiting_hours: params.awaitingHours,
    p_handoff_hours: params.handoffHours,
    p_stall_days: params.stallDays,
  });
  if (error) {
    // PGRST202: PostgREST no encuentra la función → falta aplicar la migración.
    const hint =
      error.code === 'PGRST202'
        ? ' (falta aplicar la migración 085-dashboard-alerts-rpc.sql)'
        : '';
    return { alerts: empty, error: `dashboard_alerts: ${error.message}${hint}` };
  }
  return { alerts: parseDashboardAlertsRpc(data), error: null };
}

/**
 * Palabras clave del tenant (`automation_keywords.pattern`), activas o no: las
 * de ManyChat no viven aquí y las que sí («hernia», «lumbar»…) son las mismas
 * que usa ella. Las comparten la tarjeta «Inbound» y la alerta de inbound sin
 * atender, para que las dos digan lo mismo.
 */
export async function loadKeywordPatterns(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<{ patterns: string[]; error: string | null }> {
  const kw = await supabase.from('automation_keywords').select('pattern').eq('tenant_id', tenantId);
  if (kw.error) return { patterns: [], error: kw.error.message };
  const patterns = (kw.data ?? []).map((r) => String(r.pattern ?? '')).filter((p) => p.length > 0);
  return { patterns, error: null };
}

/**
 * Rellena `inbound_keyword_flow` en las conversaciones INBOUND: si empezaron con
 * la palabra clave suelta o el botón de una automatización, o si la automatización
 * de la entrenadora las contestó en segundos (ver lib/inbound-opening.ts). Muta el
 * array recibido.
 *
 * `keywordPatterns`: las del tenant (`loadKeywordPatterns`). Si no se pasan, se
 * cargan aquí.
 */
export async function enrichWithInboundOpenings(
  supabase: SupabaseClient,
  convs: ConvSnapshot[],
  tenantId: number,
  keywordPatterns?: readonly string[],
): Promise<{ error: string | null }> {
  const inbound = convs.filter((c) => c.direction === 'inbound');
  for (const c of inbound) c.inbound_keyword_flow = false;
  if (inbound.length === 0) return { error: null };

  let patterns: readonly string[];
  if (keywordPatterns) {
    patterns = keywordPatterns;
  } else {
    const kw = await loadKeywordPatterns(supabase, tenantId);
    if (kw.error) return { error: kw.error };
    patterns = kw.patterns;
  }

  const firstLead = new Map<number, { text: string; at: string }>();
  const firstAuto = new Map<number, string>();
  const ids = inbound.map((c) => c.id);
  for (let i = 0; i < ids.length; i += REPLY_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + REPLY_LOOKUP_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('conversation_id, source, content, sent_at')
        .in('conversation_id', chunk)
        .in('source', ['lead', 'system'])
        .order('sent_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + MESSAGE_PAGE_SIZE - 1);
      if (error) return { error: error.message };
      const rows = data ?? [];
      for (const row of rows) {
        const convId = Number(row.conversation_id);
        const sentAt = String(row.sent_at);
        if (row.source === 'lead') {
          if (!firstLead.has(convId)) firstLead.set(convId, { text: String(row.content ?? ''), at: sentAt });
        } else if (firstLead.has(convId) && !firstAuto.has(convId)) {
          firstAuto.set(convId, sentAt);
        }
      }
      if (rows.length < MESSAGE_PAGE_SIZE) break;
      offset += MESSAGE_PAGE_SIZE;
    }
  }

  for (const c of inbound) {
    const lead = firstLead.get(c.id);
    c.inbound_keyword_flow = isKeywordFlowOpening({
      firstLeadText: lead?.text ?? null,
      firstLeadAt: lead?.at ?? null,
      firstAutoReplyAt: firstAuto.get(c.id) ?? null,
      keywordPatterns: patterns,
    });
  }
  return { error: null };
}
