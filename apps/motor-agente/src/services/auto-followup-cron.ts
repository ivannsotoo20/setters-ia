import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sprint Iota.1 — Auto-followup cron.
 *
 * Cada 15 min (configurable) revisa todos los tenants con
 * tenant_followup_config.enabled=true y, para cada uno, encuentra
 * conversaciones cuyo último mensaje del lead esté entre los intervals
 * configurados. Por cada match, programa el siguiente followup respetando:
 *   - Window horario (no enviar fuera de [start_hour, end_hour] en su TZ).
 *   - Max followups per lead (no exceder).
 *   - Una sola programación por lead a la vez (no apila).
 *
 * Para IG/FB: si hay plantilla AI-personalize disponible, la usa con guía;
 * si no, se salta (no improvisar texto que pudiera ser raro).
 * Para WA: necesita plantilla aprobada YCloud disponible para el tenant; si
 * no, log warning y skip.
 *
 * El motor outbound-tick existente ya envía los pending schedules cuando llega
 * scheduled_at. Esta cron solo INSERTa registros en message_schedules.
 */

interface AutoFollowupConfig {
  tenant_id: number;
  enabled: boolean;
  window_start_hour: number;
  window_end_hour: number;
  window_timezone: string;
  max_followups_per_lead: number;
  intervals_hours: number[];
}

interface ConvCandidate {
  id: number;
  tenant_id: number;
  channel_id: number;
  last_message_at: string | null;
  state: string;
  channel_kind: string;
  current_followup_count: number;
}

export interface AutoFollowupResult {
  tenantsEvaluated: number;
  candidatesFound: number;
  scheduled: number;
  skippedOutOfWindow: number;
  skippedNoTemplate: number;
  skippedMaxReached: number;
  errors: string[];
}

/**
 * Convierte una hora UTC actual a la hora local del tenant según TZ.
 * Implementación simple usando Intl.DateTimeFormat (no requiere dep externa).
 */
function getCurrentHourInTimezone(timezone: string, now: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
  } catch {
    return new Date().getUTCHours();
  }
}

function isWithinWindow(config: AutoFollowupConfig, now: Date = new Date()): boolean {
  const hour = getCurrentHourInTimezone(config.window_timezone, now);
  return hour >= config.window_start_hour && hour < config.window_end_hour;
}

/** Cuál intervalo aplica para una conv: el siguiente sin pasar maxFollowupsPerLead. */
function pickIntervalForConv(
  intervals: number[],
  currentFollowupCount: number,
  hoursSinceLastLead: number,
): { sequenceIndex: number; intervalHours: number } | null {
  if (currentFollowupCount >= intervals.length) return null;
  const intervalHours = intervals[currentFollowupCount]!;
  if (hoursSinceLastLead < intervalHours) return null;
  return { sequenceIndex: currentFollowupCount + 1, intervalHours };
}

export async function runAutoFollowupCron(
  supabase: SupabaseClient,
): Promise<AutoFollowupResult> {
  const result: AutoFollowupResult = {
    tenantsEvaluated: 0,
    candidatesFound: 0,
    scheduled: 0,
    skippedOutOfWindow: 0,
    skippedNoTemplate: 0,
    skippedMaxReached: 0,
    errors: [],
  };

  // 1. Cargar configs de todos los tenants con enabled=true
  const { data: configs, error: configErr } = await supabase
    .from('tenant_followup_config')
    .select(
      'tenant_id, enabled, window_start_hour, window_end_hour, window_timezone, max_followups_per_lead, intervals_hours',
    )
    .eq('enabled', true);
  if (configErr) {
    result.errors.push(`load configs: ${configErr.message}`);
    return result;
  }
  if (!configs || configs.length === 0) return result;

  const now = new Date();

  for (const cfg of configs as unknown as AutoFollowupConfig[]) {
    result.tenantsEvaluated += 1;
    if (!isWithinWindow(cfg, now)) {
      result.skippedOutOfWindow += 1;
      continue;
    }
    const intervals = (cfg.intervals_hours ?? []).map(Number).filter((h) => h > 0);
    const maxIntervalsHours = intervals[intervals.length - 1] ?? 168;
    const minSinceLastMs = (intervals[0] ?? 24) * 3600 * 1000;
    const maxSinceLastMs = maxIntervalsHours * 3600 * 1000 * 2; // ventana de búsqueda generosa

    // 2. Buscar conversaciones candidatas: state=active, last_message_at viejo,
    //    canal con channel_kind, no bloqueada, sin pending followup ya creado
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select(
        'id, tenant_id, channel_id, last_message_at, state, is_blocked, channels(channel_type)',
      )
      .eq('tenant_id', cfg.tenant_id)
      .eq('state', 'active')
      .eq('is_blocked', false)
      .lte('last_message_at', new Date(now.getTime() - minSinceLastMs).toISOString())
      .gte('last_message_at', new Date(now.getTime() - maxSinceLastMs).toISOString())
      .limit(200);

    if (convErr) {
      result.errors.push(`tenant ${cfg.tenant_id} convs: ${convErr.message}`);
      continue;
    }
    if (!convs || convs.length === 0) continue;

    for (const conv of convs as Array<Record<string, unknown>>) {
      result.candidatesFound += 1;

      const channelRel = conv.channels as { channel_type: string } | { channel_type: string }[] | null;
      const channelObj = Array.isArray(channelRel) ? channelRel[0] ?? null : channelRel;
      const channelKind = channelObj?.channel_type ?? '';

      // 3. Contar followups ya enviados/pending para este lead
      const { count } = await supabase
        .from('message_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', Number(conv.id))
        .eq('message_type', 'follow_up')
        .eq('triggered_by', 'auto_inactivity')
        .in('status', ['pending', 'processing', 'sent']);

      const sent = count ?? 0;
      if (sent >= cfg.max_followups_per_lead) {
        result.skippedMaxReached += 1;
        continue;
      }
      if (sent >= intervals.length) {
        result.skippedMaxReached += 1;
        continue;
      }

      // 4. Skip si ya hay un pending para esta conv
      const { count: pendingCount } = await supabase
        .from('message_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', Number(conv.id))
        .eq('message_type', 'follow_up')
        .eq('status', 'pending');
      if ((pendingCount ?? 0) > 0) continue;

      const lastLeadIso = conv.last_message_at as string | null;
      if (!lastLeadIso) continue;
      const hoursSinceLastLead = (now.getTime() - Date.parse(lastLeadIso)) / 3600000;
      const pick = pickIntervalForConv(intervals, sent, hoursSinceLastLead);
      if (!pick) continue;

      // 5. Resolver template adecuada según canal
      const { data: tpls } = await supabase
        .from('followup_templates')
        .select('id, body, ai_personalize, ai_guide, provider, status, language')
        .eq('tenant_id', cfg.tenant_id)
        .eq('channel_kind', channelKind)
        .eq('status', 'approved')
        .limit(1);

      const tpl = tpls?.[0];
      if (!tpl) {
        result.skippedNoTemplate += 1;
        continue;
      }

      // 6. Para WA: tpl debe ser ycloud/meta_cloud (regla 24h se cumple por intervals).
      if (channelKind === 'whatsapp' && tpl.provider !== 'ycloud' && tpl.provider !== 'meta_cloud') {
        result.skippedNoTemplate += 1;
        continue;
      }

      // 7. Resolver integration_account
      const { data: ia } = await supabase
        .from('integration_accounts')
        .select('id')
        .eq('channel_id', Number(conv.channel_id))
        .eq('tenant_id', cfg.tenant_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!ia) {
        result.skippedNoTemplate += 1;
        continue;
      }

      // 8. INSERT message_schedules para envío inmediato (scheduled_at = now + 30s)
      const scheduledAt = new Date(now.getTime() + 30 * 1000);
      const aiPersonalize = Boolean(tpl.ai_personalize);
      const { error: insErr } = await supabase.from('message_schedules').insert({
        tenant_id: cfg.tenant_id,
        conversation_id: Number(conv.id),
        integration_account_id: Number(ia.id),
        message_type: 'follow_up',
        message: aiPersonalize ? null : (tpl.body as string | null),
        has_attachment: false,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
        attempts: 0,
        auto_cancel_on_reply: true,
        template_id: Number(tpl.id),
        triggered_by: 'auto_inactivity',
        sequence_index: pick.sequenceIndex,
        ai_personalize: aiPersonalize,
        ai_guide: aiPersonalize ? (tpl.ai_guide as string | null) : null,
      });
      if (insErr) {
        result.errors.push(
          `insert schedule conv ${conv.id}: ${insErr.message}`,
        );
        continue;
      }
      result.scheduled += 1;
    }
  }

  return result;
}

export const _internal = {
  isWithinWindow,
  pickIntervalForConv,
  getCurrentHourInTimezone,
};
