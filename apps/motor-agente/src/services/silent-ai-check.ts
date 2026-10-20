/**
 * Alerta de IA muda (2026-10-20).
 *
 * Del 17 al 20 de octubre la IA de Tania no contestó a nadie y nadie se enteró
 * en tres días: Redis estaba colgado, el motor seguía "vivo" (webhooks 200) y la
 * única vigilancia era `integration-health-check`, que mira `last_webhook_at`,
 * y ese seguía al día porque los webhooks llegaban.
 *
 * Esto mira el síntoma en vez de la causa: conversaciones en las que la IA
 * debería estar contestando y no lo hace. Una conversación es "muda" si:
 *   - está `active`, sin handoff y con la IA no pausada (`ai_paused_until`
 *     vacío o vencido; `infinity` es pausa);
 *   - el entrenador no tiene el interruptor global apagado
 *     (`tenant_configs.ai_enabled`) y su canal tiene una integración activa
 *     (sin ella el motor no contesta a propósito: Facebook de Tania);
 *   - su último mensaje del lead lleva más de `thresholdMinutes` sin que haya
 *     detrás ninguna respuesta de la IA ni de un humano.
 *
 * Medido sobre el 1-15 oct (operación normal): ~1 caso en dos semanas. Durante
 * la caída habría saltado a los 15 minutos.
 *
 * El aviso es un `notification_events` con event_type `error_motor` y
 * `payload.kind = 'ai_silent'`, que `notify-trainer` manda a los agency admins
 * (Iván), no al entrenador. Anti-ruido: un aviso por tenant cada
 * `renotifyMinutes` como mucho, y cada conversación se avisa una sola vez por
 * mensaje del lead (`last_lead_message_id`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';
import { isAiPausedFromDb } from '../lib/ai-pause.js';

type SupabaseTyped = SupabaseClient<Database>;

export const SILENT_AI_EVENT_KIND = 'ai_silent';

const DEFAULT_THRESHOLD_MINUTES = 15;
/** Más atrás no se mira: lo de antes ya se avisó, o es otra historia. */
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_RENOTIFY_MINUTES = 30;
/** Conversaciones que caben en un aviso; el resto entra en el siguiente. */
const MAX_LISTED = 25;

export interface SilentAiCheckDeps {
  supabase: SupabaseTyped;
  now?: () => Date;
  thresholdMinutes?: number;
  lookbackHours?: number;
  renotifyMinutes?: number;
  log?: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
}

export interface SilentConversation {
  conversationId: number;
  tenantId: number;
  channelType: string | null;
  lastLeadMessageId: number;
  lastLeadAt: string;
}

export interface SilentAiCheckResult {
  silent: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

interface LeadMessageRow {
  id: number;
  conversation_id: number;
  tenant_id: number;
  sent_at: string;
}

/**
 * Devuelve las conversaciones mudas, de la más antigua a la más reciente.
 * Lanza si alguna consulta falla: el llamador lo registra y lo reintenta en el
 * siguiente tick (mejor no avisar que avisar con datos a medias).
 */
export async function findSilentConversations(
  deps: SilentAiCheckDeps,
): Promise<SilentConversation[]> {
  const { supabase } = deps;
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const thresholdMs = (deps.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES) * 60_000;
  const lookbackMs = (deps.lookbackHours ?? DEFAULT_LOOKBACK_HOURS) * 3_600_000;

  // 1. Mensajes del lead con edad entre el umbral y la ventana: el último de
  //    cada conversación es el que debería tener respuesta.
  const { data: leadRows, error: leadErr } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, tenant_id, sent_at')
    .eq('source', 'lead')
    .gte('sent_at', new Date(nowMs - lookbackMs).toISOString())
    .lte('sent_at', new Date(nowMs - thresholdMs).toISOString())
    .order('sent_at', { ascending: false })
    .limit(1000);
  if (leadErr) throw new Error(`silent-ai: lead messages: ${leadErr.message}`);

  const lastLead = new Map<number, LeadMessageRow>();
  for (const r of (leadRows ?? []) as LeadMessageRow[]) {
    const prev = lastLead.get(Number(r.conversation_id));
    if (!prev || Date.parse(r.sent_at) > Date.parse(prev.sent_at)) {
      lastLead.set(Number(r.conversation_id), r);
    }
  }
  if (lastLead.size === 0) return [];

  // 2. Solo las conversaciones en las que la IA tendría que estar contestando.
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_id, state, ai_paused_until, is_handoff_to_human')
    .in('id', [...lastLead.keys()]);
  if (convErr) throw new Error(`silent-ai: conversations: ${convErr.message}`);

  const active = (convs ?? []).filter(
    (c) =>
      c.state === 'active' &&
      c.is_handoff_to_human !== true &&
      !isAiPausedFromDb(c.ai_paused_until as string | null),
  );
  if (active.length === 0) return [];

  const tenantIds = [...new Set(active.map((c) => Number(c.tenant_id)))];
  const channelIds = [...new Set(active.map((c) => Number(c.channel_id)))];

  const [cfgRes, iaRes, chRes] = await Promise.all([
    supabase.from('tenant_configs').select('tenant_id, ai_enabled').in('tenant_id', tenantIds),
    supabase
      .from('integration_accounts')
      .select('tenant_id, channel_id')
      .eq('is_active', true)
      .in('channel_id', channelIds),
    supabase.from('channels').select('id, channel_type').in('id', channelIds),
  ]);
  if (cfgRes.error) throw new Error(`silent-ai: tenant_configs: ${cfgRes.error.message}`);
  if (iaRes.error) throw new Error(`silent-ai: integration_accounts: ${iaRes.error.message}`);
  if (chRes.error) throw new Error(`silent-ai: channels: ${chRes.error.message}`);

  const aiOff = new Set(
    (cfgRes.data ?? []).filter((c) => c.ai_enabled === false).map((c) => Number(c.tenant_id)),
  );
  const withIntegration = new Set(
    (iaRes.data ?? []).map((r) => `${Number(r.tenant_id)}:${Number(r.channel_id)}`),
  );
  const channelType = new Map(
    (chRes.data ?? []).map((c) => [Number(c.id), String(c.channel_type)] as const),
  );

  const candidates = active.filter(
    (c) =>
      !aiOff.has(Number(c.tenant_id)) &&
      withIntegration.has(`${Number(c.tenant_id)}:${Number(c.channel_id)}`),
  );
  if (candidates.length === 0) return [];

  // 3. ¿Hay respuesta de la IA o de un humano después del último mensaje del
  //    lead? 'system' no cuenta: es la automatización del proveedor, no una
  //    respuesta a lo que preguntó.
  const minLeadAt = Math.min(
    ...candidates.map((c) => Date.parse(lastLead.get(Number(c.id))!.sent_at)),
  );
  const { data: replies, error: repErr } = await supabase
    .from('conversation_messages')
    .select('conversation_id, sent_at')
    .in(
      'conversation_id',
      candidates.map((c) => Number(c.id)),
    )
    .in('source', ['ai', 'human'])
    .gte('sent_at', new Date(minLeadAt).toISOString());
  if (repErr) throw new Error(`silent-ai: replies: ${repErr.message}`);

  const lastReply = new Map<number, number>();
  for (const r of replies ?? []) {
    const cid = Number(r.conversation_id);
    const t = Date.parse(String(r.sent_at));
    if (t > (lastReply.get(cid) ?? Number.NEGATIVE_INFINITY)) lastReply.set(cid, t);
  }

  const silent: SilentConversation[] = [];
  for (const c of candidates) {
    const lead = lastLead.get(Number(c.id))!;
    const replyAt = lastReply.get(Number(c.id));
    if (replyAt != null && replyAt >= Date.parse(lead.sent_at)) continue;
    silent.push({
      conversationId: Number(c.id),
      tenantId: Number(c.tenant_id),
      channelType: channelType.get(Number(c.channel_id)) ?? null,
      lastLeadMessageId: Number(lead.id),
      lastLeadAt: lead.sent_at,
    });
  }
  return silent.sort((a, b) => Date.parse(a.lastLeadAt) - Date.parse(b.lastLeadAt));
}

interface AlertedConversation {
  conversation_id?: unknown;
  last_lead_message_id?: unknown;
}

/**
 * Busca conversaciones mudas y deja un aviso por tenant en `notification_events`.
 * Nunca lanza: un fallo se registra y cuenta en `errors`.
 */
export async function checkSilentAi(deps: SilentAiCheckDeps): Promise<SilentAiCheckResult> {
  const now = (deps.now ?? (() => new Date()))();
  const thresholdMinutes = deps.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES;
  const lookbackHours = deps.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const renotifyMs = (deps.renotifyMinutes ?? DEFAULT_RENOTIFY_MINUTES) * 60_000;
  const log = deps.log ?? {
    info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
    warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
    error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
  };
  const result: SilentAiCheckResult = { silent: 0, enqueued: 0, skipped: 0, errors: 0 };

  let silent: SilentConversation[];
  try {
    silent = await findSilentConversations({ ...deps, now: () => now });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'silent-ai-check: detección fallida');
    result.errors++;
    return result;
  }
  result.silent = silent.length;
  if (silent.length === 0) return result;

  const byTenant = new Map<number, SilentConversation[]>();
  for (const s of silent) {
    const list = byTenant.get(s.tenantId) ?? [];
    list.push(s);
    byTenant.set(s.tenantId, list);
  }

  for (const [tenantId, convs] of byTenant) {
    try {
      const { data: recent, error: recentErr } = await deps.supabase
        .from('notification_events')
        .select('created_at, payload')
        .eq('tenant_id', tenantId)
        .eq('event_type', 'error_motor')
        .gte('created_at', new Date(now.getTime() - lookbackHours * 3_600_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      if (recentErr) throw new Error(recentErr.message);

      const previous = (recent ?? []).filter(
        (e) => (e.payload as { kind?: unknown } | null)?.kind === SILENT_AI_EVENT_KIND,
      );
      const lastAlertAt = previous[0] ? Date.parse(String(previous[0].created_at)) : null;
      if (lastAlertAt != null && now.getTime() - lastAlertAt < renotifyMs) {
        result.skipped++;
        continue;
      }

      const alerted = new Set<string>();
      for (const e of previous) {
        const list = (e.payload as { conversations?: AlertedConversation[] } | null)?.conversations;
        for (const a of list ?? []) {
          alerted.add(`${Number(a.conversation_id)}:${Number(a.last_lead_message_id)}`);
        }
      }
      const fresh = convs.filter((c) => !alerted.has(`${c.conversationId}:${c.lastLeadMessageId}`));
      if (fresh.length === 0) {
        result.skipped++;
        continue;
      }

      const { error: insErr } = await deps.supabase.from('notification_events').insert({
        tenant_id: tenantId,
        event_type: 'error_motor',
        status: 'pending',
        payload: {
          kind: SILENT_AI_EVENT_KIND,
          threshold_minutes: thresholdMinutes,
          total_silent: convs.length,
          new_silent: fresh.length,
          oldest_unanswered_at: convs[0]!.lastLeadAt,
          conversations: fresh.slice(0, MAX_LISTED).map((c) => ({
            conversation_id: c.conversationId,
            channel_type: c.channelType,
            last_lead_message_id: c.lastLeadMessageId,
            last_lead_at: c.lastLeadAt,
          })),
        } as Database['public']['Tables']['notification_events']['Insert']['payload'],
      });
      if (insErr) throw new Error(insErr.message);

      result.enqueued++;
      log.warn(
        {
          tenantId,
          totalSilent: convs.length,
          newSilent: fresh.length,
          conversationIds: fresh.slice(0, MAX_LISTED).map((c) => c.conversationId),
        },
        'silent-ai-check: IA muda — aviso encolado para la agencia',
      );
    } catch (err) {
      result.errors++;
      log.error({ tenantId, err: (err as Error).message }, 'silent-ai-check: no se pudo encolar el aviso');
    }
  }

  return result;
}
