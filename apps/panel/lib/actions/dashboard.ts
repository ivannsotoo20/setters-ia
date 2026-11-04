'use server';

import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import {
  computeKpis,
  computeHistoricCloseRate,
  countUnmatchedAppointments,
  type ConvSnapshot,
  type KpiSnapshot,
} from '@/lib/dashboard-metrics';
import {
  detectAwaitingReply,
  detectInboundUnattended,
  detectStalls,
  detectUnattendedHandoffs,
  type ChannelInfo,
  type ChannelKey,
} from '@/lib/dashboard-query';
import {
  pickGranularity,
  aggregateTrend,
  type Granularity,
  type TrendPoint,
} from '@/lib/dashboard-trend';
import { ALERT_THRESHOLDS, computeAlerts, type Alert } from '@/lib/dashboard-alerts';
import {
  parseWindowKey,
  resolveWindowRange,
  type WindowKey,
} from '@/lib/pipeline-window';
import type { PipelineEvent } from '@/lib/pipeline-metrics';
import { computeWidget, type ComputedWidgetValue, type WidgetFilter } from '@/lib/widget-catalog';
import type { WidgetRow } from '@/lib/actions/dashboard-widgets';
import {
  CONV_SNAPSHOT_SELECT,
  enrichWithLeadReplies,
  enrichWithTeamReplies,
  enrichWithInboundOpenings,
  loadDashboardAlerts,
  loadKeywordPatterns,
  loadWindowAppointments,
  resolveChannelFilter,
} from '@/lib/dashboard-loader';

/**
 * Sprint Lambda — Dashboard global.
 *
 * loadDashboardData hace todas las queries necesarias en paralelo, llama a los
 * helpers puros y devuelve un snapshot estructurado para SSR.
 *
 * Read-only — no mutaciones, no revalidatePath.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ChannelFilter = 'all' | ChannelKey;

export type DashboardActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface DashboardSnapshot {
  filters: {
    windowKey: WindowKey;
    channelKey: ChannelFilter;
    fromIso: string;
    toIso: string;
    windowDays: number;
    granularity: Granularity;
  };
  kpis: KpiSnapshot;
  trend: TrendPoint[];
  alerts: Alert[];
  widgets: WidgetRow[];
  widgetValues: Record<number, ComputedWidgetValue>;
  canEditWidgets: boolean;
  meta: {
    totalConvsCurrent: number;
    totalConvsPrev: number;
    historicCloseRate: number | null;
    /**
     * Citas vivas del calendario reservadas en el periodo que no casaron con
     * ninguna conversación del SaaS (reservas directas, o leads que aún no
     * existían). No entran en "Citas agendadas" para que la tarjeta y su lista
     * cuadren; se avisa de ellas aparte.
     */
    unmatchedAppointmentsCurrent: number;
  };
}

interface PrevRange {
  from: string;
  to: string;
}

function computePrevRange(currentFromIso: string, currentToIso: string): PrevRange {
  const fromMs = Date.parse(currentFromIso);
  const toMs = Date.parse(currentToIso);
  const span = toMs - fromMs;
  return {
    from: new Date(fromMs - span).toISOString(),
    to: currentFromIso,
  };
}

function computeHistoryRange(currentFromIso: string): { from: string; to: string } {
  const toMs = Date.parse(currentFromIso);
  const fromMs = toMs - 60 * 86400 * 1000;
  return {
    from: new Date(fromMs).toISOString(),
    to: currentFromIso,
  };
}

export async function loadDashboardData(input: {
  windowKey: string | null | undefined;
  channelKey: ChannelFilter;
  customFrom?: string | null;
  customTo?: string | null;
}): Promise<DashboardActionResult<DashboardSnapshot>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const tenantId = effective.tenantId;

  const windowKey = parseWindowKey(input.windowKey ?? null);
  const range = resolveWindowRange(windowKey, input.customFrom ?? null, input.customTo ?? null);
  const prevRange = computePrevRange(range.from, range.to);
  const historyRange = computeHistoryRange(range.from);
  const windowMs = Date.parse(range.to) - Date.parse(range.from);
  const windowDays = Math.max(1, Math.round(windowMs / 86400000));
  const granularity = pickGranularity(windowDays);

  // 1. Cargar canales del tenant para mapear id → kind/direction
  const { data: channelsRaw, error: chErr } = await supabase
    .from('channels')
    .select('id, channel_type')
    .eq('tenant_id', tenantId);
  if (chErr) return { ok: false, error: chErr.message };
  const channelMap = new Map<number, ChannelInfo>();
  for (const c of channelsRaw ?? []) {
    channelMap.set(Number(c.id), { kind: String(c.channel_type) });
  }

  // El mismo resolvedor que usa el drill-down: la lista de detrás de una tarjeta
  // se filtra por canal exactamente igual que el número.
  const { channelIds, direction } = resolveChannelFilter(input.channelKey, channelMap);

  // 2. Queries en paralelo
  let convsQuery = supabase
    .from('conversations')
    .select(CONV_SNAPSHOT_SELECT)
    .eq('tenant_id', tenantId)
    .gte('created_at', range.from)
    .lte('created_at', range.to);
  if (channelIds && channelIds.length > 0) convsQuery = convsQuery.in('channel_id', channelIds);
  if (direction) convsQuery = convsQuery.eq('direction', direction);

  let prevConvsQuery = supabase
    .from('conversations')
    .select(CONV_SNAPSHOT_SELECT)
    .eq('tenant_id', tenantId)
    .gte('created_at', prevRange.from)
    .lte('created_at', prevRange.to);
  if (channelIds && channelIds.length > 0) prevConvsQuery = prevConvsQuery.in('channel_id', channelIds);
  if (direction) prevConvsQuery = prevConvsQuery.eq('direction', direction);

  const eventsQuery = supabase
    .from('pipeline_events')
    .select('event_type, from_value, to_value, source, occurred_at, conversation_id')
    .eq('tenant_id', tenantId)
    .gte('occurred_at', range.from)
    .lte('occurred_at', range.to);

  const prevEventsQuery = supabase
    .from('pipeline_events')
    .select('event_type, from_value, to_value, source, occurred_at, conversation_id')
    .eq('tenant_id', tenantId)
    .gte('occurred_at', prevRange.from)
    .lte('occurred_at', prevRange.to);

  const historyEventsQuery = supabase
    .from('pipeline_events')
    .select('event_type, from_value, to_value, source, occurred_at, conversation_id')
    .eq('tenant_id', tenantId)
    .gte('occurred_at', historyRange.from)
    .lte('occurred_at', historyRange.to);

  // Para las alertas de conversación (dashboard-query.ts) hace falta mirar el
  // tenant entero y no solo la ventana. Desde 2026-11-04 lo hace la base de
  // datos: la RPC `dashboard_alerts` (migración 085) devuelve las cuatro listas
  // con sus ids en un solo jsonb. Antes se cargaban aquí todas las activas y
  // las pasadas a la entrenadora y PostgREST cortaba la respuesta en 1.000
  // filas arbitrarias (el tenant 7 tiene 4.181 activas): «11 personas
  // esperando respuesta» cuando eran 34. Los outcomes aplicados en los últimos
  // 30d siguen cargándose aquí para dejar fuera de los atascos a quien ya
  // salió del embudo.
  const alertsPromise = loadDashboardAlerts(supabase, {
    tenantId,
    awaitingHours: ALERT_THRESHOLDS.awaitingReplyMinHours,
    handoffHours: ALERT_THRESHOLDS.handoffUnattendedMinHours,
    stallDays: ALERT_THRESHOLDS.bottleneckMinDays,
  });

  const recentOutcomesQuery = supabase
    .from('pipeline_events')
    .select('event_type, from_value, to_value, source, occurred_at, conversation_id')
    .eq('tenant_id', tenantId)
    .eq('event_type', 'outcome_applied')
    .gte('occurred_at', new Date(Date.now() - 30 * 86400000).toISOString());

  // Las palabras clave del tenant las comparten la tarjeta «Inbound» y la
  // alerta de inbound sin atender: una sola carga.
  const keywordsPromise = loadKeywordPatterns(supabase, tenantId);

  const [
    convsRes,
    prevConvsRes,
    eventsRes,
    prevEventsRes,
    historyEventsRes,
    recentOutcomesRes,
    alertsRes,
    keywordsRes,
  ] = await Promise.all([
    convsQuery,
    prevConvsQuery,
    eventsQuery,
    prevEventsQuery,
    historyEventsQuery,
    recentOutcomesQuery,
    alertsPromise,
    keywordsPromise,
  ]);

  for (const res of [convsRes, prevConvsRes, eventsRes, prevEventsRes, historyEventsRes, recentOutcomesRes]) {
    if (res.error) return { ok: false, error: res.error.message };
  }
  if (alertsRes.error) return { ok: false, error: alertsRes.error };
  if (keywordsRes.error) return { ok: false, error: keywordsRes.error };

  const convs = (convsRes.data ?? []) as unknown as ConvSnapshot[];
  const prevConvs = (prevConvsRes.data ?? []) as unknown as ConvSnapshot[];
  const events = (eventsRes.data ?? []) as PipelineEvent[];
  const prevEvents = (prevEventsRes.data ?? []) as PipelineEvent[];
  const historyEvents = (historyEventsRes.data ?? []) as PipelineEvent[];
  const recentOutcomes = (recentOutcomesRes.data ?? []) as PipelineEvent[];
  const alertRows = alertsRes.alerts;
  const keywordPatterns = keywordsRes.patterns;

  // 2b. ¿Contestó la persona? Solo para las conversaciones que abrió la
  //     entrenadora (outbound): alimenta "bienvenidas respondidas" y
  //     "palabra clave respondidos". Ver dashboard-loader.ts para el porqué de
  //     leerlo de los mensajes y no de conversations.first_lead_response_at.
  //     Y las citas reales del calendario vinculado (2026-09-12): "Citas
  //     agendadas" sale de `calendar_appointments`, no del proxy F6/F7.
  //     Y para las que abrió la persona (inbound, 2026-10-20): ¿le contestó
  //     alguien? Alimenta "Inbound atendidos".
  const [
    replyCur,
    replyPrev,
    teamCur,
    teamPrev,
    openingCur,
    openingPrev,
    apptCur,
    apptPrev,
  ] = await Promise.all([
    enrichWithLeadReplies(supabase, convs),
    enrichWithLeadReplies(supabase, prevConvs),
    enrichWithTeamReplies(supabase, convs),
    enrichWithTeamReplies(supabase, prevConvs),
    enrichWithInboundOpenings(supabase, convs, tenantId, keywordPatterns),
    enrichWithInboundOpenings(supabase, prevConvs, tenantId, keywordPatterns),
    loadWindowAppointments(supabase, {
      tenantId,
      fromIso: range.from,
      toIso: range.to,
      channelIds,
      direction,
    }),
    loadWindowAppointments(supabase, {
      tenantId,
      fromIso: prevRange.from,
      toIso: prevRange.to,
      channelIds,
      direction,
    }),
  ]);
  if (replyCur.error) return { ok: false, error: replyCur.error };
  if (replyPrev.error) return { ok: false, error: replyPrev.error };
  if (teamCur.error) return { ok: false, error: teamCur.error };
  if (teamPrev.error) return { ok: false, error: teamPrev.error };
  if (openingCur.error) return { ok: false, error: openingCur.error };
  if (openingPrev.error) return { ok: false, error: openingPrev.error };
  if (apptCur.error) return { ok: false, error: apptCur.error };
  if (apptPrev.error) return { ok: false, error: apptPrev.error };
  const appointments = apptCur.appointments;
  const prevAppointments = apptPrev.appointments;

  // 3. KPIs
  const kpis = computeKpis({
    currentEvents: events,
    prevEvents,
    currentConvs: convs,
    prevConvs,
    currentWindowFromIso: range.from,
    prevWindowFromIso: prevRange.from,
    currentAppointments: appointments,
    prevAppointments,
  });

  // 5. Trend
  const trend = aggregateTrend({
    events,
    convs,
    channelMap,
    fromIso: range.from,
    toIso: range.to,
    granularity,
  });

  // 6. Alerts — las filas vienen de la RPC (ver arriba); aquí solo lo que no
  //    vive en SQL: outcomes, agrupación por canal × fase, horas, y el filtro de
  //    apertura de palabra clave de los inbound.
  const outcomeConvIds = new Set(recentOutcomes.map((e) => e.conversation_id));
  const stalls = detectStalls({
    rows: alertRows.stalls,
    channelMap,
    daysThreshold: ALERT_THRESHOLDS.bottleneckMinDays,
    countThreshold: ALERT_THRESHOLDS.bottleneckMinCount,
    outcomeConvIds,
  });
  const awaitingReply = detectAwaitingReply({
    rows: alertRows.awaitingReply,
    hoursThreshold: ALERT_THRESHOLDS.awaitingReplyMinHours,
  });
  const unattendedHandoffs = detectUnattendedHandoffs({
    rows: alertRows.handoffUnattended,
    hoursThreshold: ALERT_THRESHOLDS.handoffUnattendedMinHours,
  });
  const inboundUnattended = detectInboundUnattended({
    rows: alertRows.inboundUnattended,
    keywordPatterns,
  });
  const closeRateBaseline = computeHistoricCloseRate(historyEvents);
  const noShowCount = events.filter(
    (e) => e.event_type === 'outcome_applied' && e.to_value === 'no_show',
  ).length;
  const alerts = computeAlerts({
    kpis,
    stalls,
    awaitingReply,
    unattendedHandoffs,
    inboundUnattended,
    closeRateBaseline,
    noShowCurrentCount: noShowCount,
    noShowWindowDays: windowDays,
    historicEvents: historyEvents,
  });

  // 7. Widgets — cargar lista del tenant + computar value para cada uno.
  // Cada widget puede tener su propio filtro de canal independiente del filtro
  // global del dashboard. Si el widget tiene channel=wa, se computa solo con
  // datos de WA (independiente del channelKey global).
  const widgetsRes = await supabase
    .from('dashboard_widgets')
    .select('id, metric_key, filter_json, position')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true });

  const widgets: WidgetRow[] = (widgetsRes.data ?? []).map((r) => ({
    id: Number(r.id),
    metricKey: String(r.metric_key),
    filter: ((): WidgetFilter => {
      const raw = r.filter_json as unknown;
      if (!raw || typeof raw !== 'object') return {};
      const obj = raw as Record<string, unknown>;
      if (typeof obj.channel === 'string') {
        if (['wa', 'fb', 'ig-in', 'ig-out'].includes(obj.channel)) {
          return { channel: obj.channel as ChannelKey };
        }
      }
      return {};
    })(),
    position: Number(r.position),
  }));

  const widgetValues: Record<number, ComputedWidgetValue> = {};
  for (const w of widgets) {
    widgetValues[w.id] = computeWidget(
      w.metricKey,
      w.filter,
      {
        currentEvents: events,
        prevEvents,
        currentConvs: convs,
        prevConvs,
        currentWindowFromIso: range.from,
        prevWindowFromIso: prevRange.from,
        currentAppointments: appointments,
        prevAppointments,
      },
      channelMap,
    );
  }

  const canEditWidgets =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';

  return {
    ok: true,
    data: {
      filters: {
        windowKey,
        channelKey: input.channelKey,
        fromIso: range.from,
        toIso: range.to,
        windowDays,
        granularity,
      },
      kpis,
      trend,
      alerts,
      widgets,
      widgetValues,
      canEditWidgets,
      meta: {
        totalConvsCurrent: convs.length,
        totalConvsPrev: prevConvs.length,
        historicCloseRate: closeRateBaseline,
        unmatchedAppointmentsCurrent: countUnmatchedAppointments(appointments),
      },
    },
  };
}
