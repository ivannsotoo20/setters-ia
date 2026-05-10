'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { personalizeFollowupAtMaterialize } from '@/lib/personalize-followup';
import type { ActionResult } from './followups';

/**
 * Sprint Iota.1.c — Materializar la SECUENCIA COMPLETA de followups
 * automáticos al entrar a una conversación (previsualización al cargar).
 *
 * En vez de esperar al cron 15min, cuando el trainer abre una conversación
 * elegible, creamos TODOS los schedules pendientes (uno por cada interval
 * dentro de la ventana 24h post-último-mensaje del lead) INMEDIATAMENTE
 * en BD para que el panel derecho los muestre con hora absoluta + preview.
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
  materialized: number; // count de schedules creados (puede ser >1 si toda la secuencia)
  reason?: string;
  scheduleIds?: number[];
}

/**
 * Materializa TODA la secuencia de followups pendientes para una conv.
 * Idempotente: si ya hay pending, no duplica.
 */
export async function materializeFollowupSequenceForConv(
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
    return { ok: true, data: { materialized: 0, reason: 'conv no activa' } };
  }
  if (conv.is_blocked) {
    return { ok: true, data: { materialized: 0, reason: 'conv bloqueada' } };
  }

  const channelRel = conv.channels as { channel_type: string } | { channel_type: string }[] | null;
  const channelObj = Array.isArray(channelRel) ? channelRel[0] ?? null : channelRel;
  const channelKind = channelObj?.channel_type ?? '';

  // WhatsApp NO se pre-materializa (necesita template aprobada explícita).
  if (channelKind !== 'instagram_dm' && channelKind !== 'facebook_messenger') {
    return { ok: true, data: { materialized: 0, reason: 'canal no IG/FB' } };
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
    return {
      ok: true,
      data: { materialized: 0, reason: 'auto-followups desactivados' },
    };
  }

  // 3. Skip si ya hay pending follow_up para esta conv (idempotente)
  const { count: pendingCount } = await supabase
    .from('message_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('message_type', 'follow_up')
    .eq('status', 'pending');
  if ((pendingCount ?? 0) > 0) {
    return { ok: true, data: { materialized: 0, reason: 'ya hay pending' } };
  }

  // 4. Contar followups auto enviados ya
  const { count: sentCount } = await supabase
    .from('message_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('message_type', 'follow_up')
    .eq('triggered_by', 'auto_inactivity')
    .in('status', ['pending', 'processing', 'sent']);
  const sent = sentCount ?? 0;
  const intervals = (cfg.intervals_hours as number[])
    .filter((h) => Number.isFinite(h) && h >= 1 && h <= 24)
    .sort((a, b) => a - b);
  const maxFromConfig = Number(cfg.max_followups_per_lead);
  const remaining = Math.min(intervals.length, maxFromConfig) - sent;
  if (remaining <= 0) {
    return { ok: true, data: { materialized: 0, reason: 'max alcanzado' } };
  }

  // 5. Validar last_message_at
  const lastLeadIso = conv.last_message_at as string | null;
  if (!lastLeadIso) {
    return { ok: true, data: { materialized: 0, reason: 'sin last_message_at' } };
  }
  const lastLeadMs = Date.parse(lastLeadIso);
  const now = Date.now();

  // 6. Resolver template (una para toda la secuencia)
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
      data: { materialized: 0, reason: 'sin plantilla AI ni texto fallback configurado' },
    };
  }

  // 7. Resolver integration_account
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
      data: { materialized: 0, reason: 'integration_account no activa' },
    };
  }

  // 8. Iterar por cada interval restante y crear UN schedule por cada uno
  const tz = String(cfg.window_timezone);
  const startHour = Number(cfg.window_start_hour);
  const endHour = Number(cfg.window_end_hour);
  const created: number[] = [];

  for (let idx = sent; idx < Math.min(intervals.length, maxFromConfig); idx++) {
    const intervalHours = intervals[idx]!;
    const projectedMs = lastLeadMs + intervalHours * 3600_000;

    // Skip si scheduled_at ya pasó hace mucho (>1h en el pasado)
    if (projectedMs < now - 3600_000) continue;

    let scheduledAt = new Date(Math.max(projectedMs, now + 60_000));
    // Ajustar al window horario
    let safety = 48;
    while (
      (getCurrentHourInTimezone(tz, scheduledAt) < startHour ||
        getCurrentHourInTimezone(tz, scheduledAt) >= endHour) &&
      safety > 0
    ) {
      scheduledAt = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
      safety -= 1;
    }

    // Sprint Iota.1.e — pre-generar el mensaje IA AHORA (no esperar al envío)
    // para que el panel del chat lo muestre como preview real, no placeholder.
    let preGenerated: string | null = null;
    if (tpl.aiPersonalize && tpl.aiGuide) {
      const result = await personalizeFollowupAtMaterialize({
        supabase,
        conversationId,
        aiGuide: tpl.aiGuide,
      });
      if (result.ok) {
        preGenerated = result.message;
      }
      // Si falla: schedule se crea con message=null y el motor regenera al envío.
    }

    const { data, error } = await supabase
      .from('message_schedules')
      .insert({
        tenant_id: Number(conv.tenant_id),
        conversation_id: conversationId,
        integration_account_id: Number(ia.id),
        message_type: 'follow_up',
        message: tpl.aiPersonalize ? preGenerated : tpl.body,
        has_attachment: false,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
        attempts: 0,
        auto_cancel_on_reply: true,
        template_id: tpl.id,
        triggered_by: 'auto_inactivity',
        sequence_index: idx + 1,
        ai_personalize: tpl.aiPersonalize,
        ai_guide: tpl.aiPersonalize ? tpl.aiGuide : null,
      })
      .select('id')
      .single();
    if (error || !data) continue; // best-effort
    created.push(Number(data.id));
  }

  if (created.length === 0) {
    return { ok: true, data: { materialized: 0, reason: 'todos los intervals ya pasaron' } };
  }

  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true, data: { materialized: created.length, scheduleIds: created } };
}

/** Alias retro-compat por si hay imports antiguos. */
export const materializeNextFollowupForConv = materializeFollowupSequenceForConv;
