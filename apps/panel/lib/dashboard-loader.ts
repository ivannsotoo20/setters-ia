import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConvSnapshot } from './dashboard-metrics';
import type { ChannelInfo, ChannelKey } from './dashboard-query';
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
 * bienvenida de palabra clave por ese campo.
 */
export const CONV_SNAPSHOT_SELECT =
  'id, state, is_qualified, phase_number, channel_id, direction, last_message_at, created_at, conversation_source';

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
