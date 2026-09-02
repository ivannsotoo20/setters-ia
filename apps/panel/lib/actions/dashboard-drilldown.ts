'use server';

import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import {
  enrichWithLeadReplies,
  loadChannelMap,
  loadWindowConvs,
  loadWindowEvents,
  resolveChannelFilter,
  type ChannelFilter,
} from '@/lib/dashboard-loader';
import { getWidgetDef, selectWidgetMembers, type WidgetFilter } from '@/lib/widget-catalog';

/**
 * Drill-down de un widget del dashboard (2026-09-02).
 *
 * Tania: "si le haces click a la métrica de conversaciones activas, que salga
 * la lista de todas las personas incluidas, y que si le haces click a una
 * persona te lleve a la conversación".
 *
 * Read-only. Recibe la misma ventana y el mismo filtro global de canal que
 * pintó la tarjeta, vuelve a cargar los datos de esa ventana y selecciona las
 * conversaciones con `selectWidgetMembers` — la misma selección que hizo el
 * número. Después las viste con el nombre de la persona para la lista.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface WidgetMemberRow {
  conversationId: number;
  leadName: string;
  channelLabel: string;
  phase: number;
  state: string;
  lastMessageAt: string | null;
  /** En una tasa: si esta conversación cuenta en el numerador. null en volúmenes. */
  inNumerator: boolean | null;
}

export interface WidgetMembersResult {
  rows: WidgetMemberRow[];
  total: number;
  truncated: boolean;
}

export type DrilldownResult = { ok: true; data: WidgetMembersResult } | { ok: false; error: string };

const MAX_ROWS = 300;
/** Tope de ventana: el dashboard nunca ofrece más, y así nadie carga años enteros. */
const MAX_SPAN_DAYS = 400;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

function isValidChannelFilter(v: unknown): v is ChannelFilter {
  return v === 'all' || v === 'wa' || v === 'fb' || v === 'ig-in' || v === 'ig-out';
}

export async function listWidgetMembers(input: {
  metricKey: string;
  filter: WidgetFilter | null;
  channelKey: string;
  fromIso: string;
  toIso: string;
}): Promise<DrilldownResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const def = getWidgetDef(input.metricKey);
  if (!def) return { ok: false, error: 'métrica desconocida' };
  const channelKey: ChannelFilter = isValidChannelFilter(input.channelKey) ? input.channelKey : 'all';

  const fromMs = Date.parse(input.fromIso);
  const toMs = Date.parse(input.toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return { ok: false, error: 'ventana inválida' };
  }
  if (toMs - fromMs > MAX_SPAN_DAYS * 86400000) {
    return { ok: false, error: 'ventana demasiado grande' };
  }
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const supabase = getServiceRoleClient();
  const tenantId = eff.tenantId;

  const { channelMap, error: chErr } = await loadChannelMap(supabase, tenantId);
  if (chErr) return { ok: false, error: chErr };
  const { channelIds, direction } = resolveChannelFilter(channelKey, channelMap);

  const [convsRes, eventsRes] = await Promise.all([
    loadWindowConvs(supabase, { tenantId, fromIso, toIso, channelIds, direction }),
    loadWindowEvents(supabase, { tenantId, fromIso, toIso }),
  ]);
  if (convsRes.error) return { ok: false, error: convsRes.error };
  if (eventsRes.error) return { ok: false, error: eventsRes.error };
  const enrich = await enrichWithLeadReplies(supabase, convsRes.convs);
  if (enrich.error) return { ok: false, error: enrich.error };

  const members = selectWidgetMembers(
    input.metricKey,
    input.filter ?? {},
    {
      currentEvents: eventsRes.events,
      prevEvents: [],
      currentConvs: convsRes.convs,
      prevConvs: [],
      currentWindowFromIso: fromIso,
      prevWindowFromIso: fromIso,
    },
    channelMap,
  );

  const total = members.conversationIds.length;
  if (total === 0) return { ok: true, data: { rows: [], total: 0, truncated: false } };

  // Las conversaciones que salen de eventos (cualificados, agendados, outcomes)
  // pueden no estar en el snapshot de la ventana (se crearon antes), así que la
  // ficha se pide por id a la tabla, no se reconstruye desde el snapshot.
  const wantedIds = members.conversationIds.slice(0, MAX_ROWS);
  const { data: rowsRaw, error: rowsErr } = await supabase
    .from('conversations')
    .select(
      'id, phase_number, state, last_message_at, channel_id, leads(first_name, last_name, phone, external_id)',
    )
    .eq('tenant_id', tenantId)
    .in('id', wantedIds)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (rowsErr) return { ok: false, error: rowsErr.message };

  const rows: WidgetMemberRow[] = (rowsRaw ?? []).map((r) => {
    const lead = (Array.isArray(r.leads) ? r.leads[0] : r.leads) as
      | { first_name: string | null; last_name: string | null; phone: string | null; external_id: string | null }
      | null
      | undefined;
    const fullName = [lead?.first_name ?? '', lead?.last_name ?? ''].join(' ').trim();
    const leadName = fullName || lead?.phone || lead?.external_id || `Lead #${r.id}`;
    const channelKind = channelMap.get(Number(r.channel_id))?.kind ?? '';
    return {
      conversationId: Number(r.id),
      leadName,
      channelLabel: CHANNEL_LABEL[channelKind] ?? channelKind ?? '—',
      phase: Number(r.phase_number ?? 0),
      state: String(r.state ?? ''),
      lastMessageAt: r.last_message_at ? String(r.last_message_at) : null,
      inNumerator: members.numeratorIds ? members.numeratorIds.has(Number(r.id)) : null,
    };
  });

  return { ok: true, data: { rows, total, truncated: total > MAX_ROWS } };
}
