import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConvSnapshot } from './dashboard-metrics';
import {
  isTestLeadName,
  type ChannelInfo,
  type ChannelKey,
  type LastMessageInfo,
  type MessageSource,
} from './dashboard-query';
import type { PipelineEvent } from './pipeline-metrics';

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

const MESSAGE_PAGE_SIZE = 1000;

/**
 * Último mensaje de cada conversación (quién lo escribió y cuándo) más la
 * fecha del último mensaje de la entrenadora. Alimenta las tres alertas de
 * conversación de `dashboard-query.ts`.
 *
 * Se leen `conversation_messages` por lotes de 200 conversaciones (límite de
 * URL de PostgREST) y, dentro de cada lote, por páginas de 1000 filas:
 * Supabase corta cada respuesta en 1000 (max-rows) y 200 conversaciones con
 * todos sus mensajes lo superan de sobra. El "último" se calcula en JS; el
 * orden solo hace estable la paginación. Las conversaciones sin mensajes no
 * aparecen en el mapa.
 */
export async function loadLastMessageBySource(
  supabase: SupabaseClient,
  convIds: number[],
): Promise<{ lastMessages: Map<number, LastMessageInfo>; error: string | null }> {
  const lastMessages = new Map<number, LastMessageInfo>();
  const ids = Array.from(new Set(convIds));
  for (let i = 0; i < ids.length; i += REPLY_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + REPLY_LOOKUP_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('conversation_id, source, sent_at')
        .in('conversation_id', chunk)
        .order('sent_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + MESSAGE_PAGE_SIZE - 1);
      if (error) return { lastMessages, error: error.message };
      const rows = data ?? [];
      for (const row of rows) {
        const convId = Number(row.conversation_id);
        const source = String(row.source) as MessageSource;
        const sentAt = String(row.sent_at);
        const prev = lastMessages.get(convId);
        const lastHumanAt =
          source === 'human' &&
          (!prev?.lastHumanAt || Date.parse(sentAt) >= Date.parse(prev.lastHumanAt))
            ? sentAt
            : (prev?.lastHumanAt ?? null);
        if (!prev || Date.parse(sentAt) >= Date.parse(prev.sentAt)) {
          lastMessages.set(convId, { source, sentAt, lastHumanAt });
        } else {
          lastMessages.set(convId, { ...prev, lastHumanAt });
        }
      }
      if (rows.length < MESSAGE_PAGE_SIZE) break;
      offset += rows.length;
    }
  }
  return { lastMessages, error: null };
}

/**
 * Ids de los leads de prueba del tenant (los de Iván), para dejar sus
 * conversaciones fuera de las alertas. El filtro va en la consulta
 * (`first_name` = ivan / iván sin distinguir mayúsculas) y se repasa en JS
 * con `isTestLeadName`, que es quien fija el criterio.
 */
export async function loadTestLeadIds(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<{ testLeadIds: Set<number>; error: string | null }> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, first_name')
    .eq('tenant_id', tenantId)
    .or('first_name.ilike.ivan,first_name.ilike.iván');
  if (error) return { testLeadIds: new Set(), error: error.message };
  const testLeadIds = new Set<number>();
  for (const row of data ?? []) {
    if (isTestLeadName(row.first_name as string | null)) testLeadIds.add(Number(row.id));
  }
  return { testLeadIds, error: null };
}
