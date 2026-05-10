'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import type { ActionResult } from './followups';

/**
 * Sprint Iota.1.b — Materializar el siguiente followup AL ENTRAR a la conv
 * (estilo SkaleX preview).
 *
 * En vez de esperar al cron 15min, cuando el trainer abre una conversación
 * elegible, creamos el siguiente schedule INMEDIATAMENTE en BD para que el
 * panel derecho lo muestre con countdown + preview.
 *
 * Reglas:
 *   - tenant_followup_config.enabled = true
 *   - canal IG/FB (WhatsApp NO se pre-materializa por la regla 24h estricta)
 *   - lead.last_message_at < now - intervals[currentSent] (cumple intervalo)
 *   - O lead.last_message_at < now - (intervals[currentSent] - lookahead_hours)
 *     (proyección dentro de la ventana de antelación)
 *   - No hay otro pending para esta conv
 *   - sent < max_followups_per_lead AND sent < intervals.length
 *   - Estamos dentro del window horario del tenant
 *
 * Si auto_personalize=true: se crea con ai_personalize=true + ai_guide
 *   (ya sea de plantilla AI o derivada de default_followup_text).
 * Si OFF: se crea con message=default_followup_text directo.
 *
 * Auth: cualquier rol del tenant + agency admin (lectura+materialize, no es
 * destructivo: si lead responde antes, trigger DB cancela).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

export interface MaterializeResult {
  materialized: boolean;
  reason?: string;
  scheduleId?: number;
}

export async function materializeNextFollowupForConv(
  conversationId: number,
): Promise<ActionResult<MaterializeResult>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();

  // 1. Cargar conv + canal
  const { data: conv } = await supabase
    .from('conversations')
    .select(
      `id, tenant_id, channel_id, last_message_at, state, is_blocked,
       channels(channel_type)`,
    )
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  if (conv.state !== 'active') {
    return { ok: true, data: { materialized: false, reason: 'conv no activa' } };
  }
  if (conv.is_blocked) {
    return { ok: true, data: { materialized: false, reason: 'conv bloqueada' } };
  }

  const channelRel = conv.channels as { channel_type: string } | { channel_type: string }[] | null;
  const channelObj = Array.isArray(channelRel) ? channelRel[0] ?? null : channelRel;
  const channelKind = channelObj?.channel_type ?? '';

  // WhatsApp NO se pre-materializa (necesita template aprobada explícita).
  if (channelKind !== 'instagram_dm' && channelKind !== 'facebook_messenger') {
    return { ok: true, data: { materialized: false, reason: 'canal no IG/FB' } };
  }

  // 2. Cargar config
  const { data: cfg } = await supabase
    .from('tenant_followup_config')
    .select(
      `enabled, window_start_hour, window_end_hour, window_timezone,
       max_followups_per_lead, intervals_hours,
       auto_personalize, default_followup_text, materialize_lookahead_hours`,
    )
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();
  if (!cfg || !cfg.enabled) {
    return { ok: true, data: { materialized: false, reason: 'auto-followups desactivados' } };
  }

  // 3. Skip si ya hay pending follow_up para esta conv
  const { count: pendingCount } = await supabase
    .from('message_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('message_type', 'follow_up')
    .eq('status', 'pending');
  if ((pendingCount ?? 0) > 0) {
    return { ok: true, data: { materialized: false, reason: 'ya hay pending' } };
  }

  // 4. Contar followups auto enviados/pending/processing
  const { count: sentCount } = await supabase
    .from('message_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('message_type', 'follow_up')
    .eq('triggered_by', 'auto_inactivity')
    .in('status', ['pending', 'processing', 'sent']);
  const sent = sentCount ?? 0;
  const intervals = (cfg.intervals_hours as number[]).filter((h) => h > 0);
  if (sent >= Number(cfg.max_followups_per_lead) || sent >= intervals.length) {
    return { ok: true, data: { materialized: false, reason: 'max alcanzado' } };
  }

  // 5. Calcular scheduled_at proyectado
  const lastLeadIso = conv.last_message_at as string | null;
  if (!lastLeadIso) {
    return { ok: true, data: { materialized: false, reason: 'sin last_message_at' } };
  }
  const lastLeadMs = Date.parse(lastLeadIso);
  const intervalHours = intervals[sent]!;
  const projectedMs = lastLeadMs + intervalHours * 3600_000;
  const lookaheadMs = Number(cfg.materialize_lookahead_hours ?? 24) * 3600_000;
  const earliestMaterializeMs = projectedMs - lookaheadMs;
  const now = Date.now();

  if (now < earliestMaterializeMs) {
    return {
      ok: true,
      data: {
        materialized: false,
        reason: `aún muy pronto (${Math.round((earliestMaterializeMs - now) / 3600_000)}h hasta ventana)`,
      },
    };
  }

  // 6. Ajustar scheduled_at al window horario (si proyectado cae fuera, mover dentro)
  let scheduledAt = new Date(Math.max(projectedMs, now + 60_000));
  const tz = String(cfg.window_timezone);
  const startHour = Number(cfg.window_start_hour);
  const endHour = Number(cfg.window_end_hour);
  const hourAtScheduled = getCurrentHourInTimezone(tz, scheduledAt);
  if (hourAtScheduled < startHour || hourAtScheduled >= endHour) {
    // Mover al startHour del próximo día permitido (simplificado: añadir hasta caer dentro)
    let safety = 24;
    while (
      (getCurrentHourInTimezone(tz, scheduledAt) < startHour ||
        getCurrentHourInTimezone(tz, scheduledAt) >= endHour) &&
      safety > 0
    ) {
      scheduledAt = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
      safety -= 1;
    }
  }

  // 7. Resolver template + lógica auto_personalize per canal (mismo patrón que cron)
  let tpl: {
    id: number | null;
    body: string | null;
    aiPersonalize: boolean;
    aiGuide: string | null;
  } | null = null;

  if (cfg.auto_personalize) {
    const { data: aiTpls } = await supabase
      .from('followup_templates')
      .select('id, body, ai_personalize, ai_guide')
      .eq('tenant_id', eff.tenantId)
      .eq('channel_kind', channelKind)
      .eq('status', 'approved')
      .eq('ai_personalize', true)
      .limit(1);
    if (aiTpls?.[0]) {
      tpl = {
        id: Number(aiTpls[0].id),
        body: null,
        aiPersonalize: true,
        aiGuide: (aiTpls[0].ai_guide as string | null) ?? null,
      };
    } else if (cfg.default_followup_text) {
      tpl = {
        id: null,
        body: null,
        aiPersonalize: true,
        aiGuide: `Reescribe este mensaje base manteniendo el tono y la intención, pero personalizándolo con el contexto de la conversación: "${cfg.default_followup_text}"`,
      };
    }
  } else if (cfg.default_followup_text) {
    tpl = {
      id: null,
      body: cfg.default_followup_text as string,
      aiPersonalize: false,
      aiGuide: null,
    };
  }

  if (!tpl) {
    return {
      ok: true,
      data: { materialized: false, reason: 'sin plantilla AI ni texto fallback configurado' },
    };
  }

  // 8. Resolver integration_account
  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('channel_id', Number(conv.channel_id))
    .eq('tenant_id', Number(conv.tenant_id))
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!ia) {
    return {
      ok: true,
      data: { materialized: false, reason: 'integration_account no activa' },
    };
  }

  // 9. INSERT message_schedules
  const { data, error } = await supabase
    .from('message_schedules')
    .insert({
      tenant_id: Number(conv.tenant_id),
      conversation_id: conversationId,
      integration_account_id: Number(ia.id),
      message_type: 'follow_up',
      message: tpl.aiPersonalize ? null : tpl.body,
      has_attachment: false,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending',
      attempts: 0,
      auto_cancel_on_reply: true,
      template_id: tpl.id,
      triggered_by: 'auto_inactivity',
      sequence_index: sent + 1,
      ai_personalize: tpl.aiPersonalize,
      ai_guide: tpl.aiPersonalize ? tpl.aiGuide : null,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true, data: { materialized: true, scheduleId: Number(data.id) } };
}
