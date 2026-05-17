import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cálculo de typing delays para programar el envío de las partes.
 *
 * Reglas (replicando el setter actual de Ivan):
 *  - El primer mensaje aparece tras `baseDelaySec` desde NOW (sensación de "leyendo + escribiendo").
 *    `baseDelaySec` = `active_conversation_delay` si el lead está activo (acabó de escribir),
 *    `idle_conversation_delay` si lleva tiempo callado (no aplicable aún en MVP — siempre activo).
 *  - Los mensajes 2..N siguen al anterior con un gap de 10s (typing entre burbujas).
 */
export interface TypingDelayConfig {
  /** Segundos antes del primer mensaje (lead activo). */
  activeDelaySec: number;
  /** Segundos entre mensajes consecutivos. */
  betweenPartsSec: number;
}

export const DEFAULT_TYPING_DELAY: TypingDelayConfig = {
  activeDelaySec: 30,
  betweenPartsSec: 10,
};

export function computeScheduledTimes(
  partsCount: number,
  config: TypingDelayConfig = DEFAULT_TYPING_DELAY,
  nowMs = Date.now(),
): Date[] {
  if (partsCount <= 0) return [];
  const out: Date[] = [];
  let cursor = nowMs + config.activeDelaySec * 1000;
  for (let i = 0; i < partsCount; i++) {
    out.push(new Date(cursor));
    cursor += config.betweenPartsSec * 1000;
  }
  return out;
}

/** Backoffs entre intentos de envío en caso de error. */
export const RETRY_BACKOFFS_MS = [5_000, 30_000, 5 * 60_000] as const;
export const MAX_RETRY_ATTEMPTS = RETRY_BACKOFFS_MS.length;

export function nextRetryAt(currentAttempts: number, nowMs = Date.now()): Date | null {
  if (currentAttempts >= MAX_RETRY_ATTEMPTS) return null;
  const delay = RETRY_BACKOFFS_MS[currentAttempts]!;
  return new Date(nowMs + delay);
}

/** Convierte un PostgreSQL `interval` ISO ('00:00:30' / 'PT30S') a segundos. */
export function intervalToSeconds(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  // Formato HH:MM:SS o HH:MM:SS.fff
  const hms = value.match(/^(\d+):(\d{2}):(\d{2})/);
  if (hms) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  }
  // Formato ISO 8601 PT30S, PT5M, PT1H30M, etc.
  const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (iso) {
    const h = iso[1] ? Number(iso[1]) : 0;
    const m = iso[2] ? Number(iso[2]) : 0;
    const s = iso[3] ? Number(iso[3]) : 0;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

/** Carga la config de typing para un tenant desde `tenant_configs`. */
export async function loadTypingConfig(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<TypingDelayConfig> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('active_conversation_delay, idle_conversation_delay')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) {
    return DEFAULT_TYPING_DELAY;
  }
  const active =
    intervalToSeconds(data.active_conversation_delay) ?? DEFAULT_TYPING_DELAY.activeDelaySec;
  return {
    activeDelaySec: active,
    betweenPartsSec: DEFAULT_TYPING_DELAY.betweenPartsSec,
  };
}

interface InsertScheduledPartsParams {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  integrationAccountId: number;
  parts: string[];
  scheduledAt: Date[];
}

export async function insertScheduledParts({
  supabase,
  tenantId,
  conversationId,
  integrationAccountId,
  parts,
  scheduledAt,
}: InsertScheduledPartsParams): Promise<{ ids: number[] }> {
  if (parts.length === 0) return { ids: [] };
  if (parts.length !== scheduledAt.length) {
    throw new Error(
      `insertScheduledParts: parts.length (${parts.length}) !== scheduledAt.length (${scheduledAt.length})`,
    );
  }

  const rows = parts.map((text, i) => ({
    tenant_id: tenantId,
    conversation_id: conversationId,
    integration_account_id: integrationAccountId,
    message_type: 'message' as const,
    message: text,
    has_attachment: false,
    scheduled_at: scheduledAt[i]!.toISOString(),
    status: 'pending' as const,
    attempts: 0,
    // Hito 10.6.1 fix — marcar partes del bot del turno actual. El outbound-gate
    // las deja pasar aunque la IA se haya pausado durante el mismo turno (caso
    // típico: API booking inline pausa IA infinity tras crear cita, pero las
    // partes "Listo te apunto..." aún tienen que enviarse al lead).
    triggered_by: 'ai_turn' as const,
  }));

  const { data, error } = await supabase
    .from('message_schedules')
    .insert(rows)
    .select('id');

  if (error) {
    throw new Error(`insertScheduledParts failed: ${error.message}`);
  }
  return { ids: (data ?? []).map((r) => Number(r.id)) };
}

interface MarkSentParams {
  supabase: SupabaseClient;
  scheduleId: number;
  providerMessageId: string;
}

export async function markScheduleSent({
  supabase,
  scheduleId,
  providerMessageId,
}: MarkSentParams): Promise<void> {
  const { error } = await supabase
    .from('message_schedules')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', scheduleId);
  if (error) {
    throw new Error(`markScheduleSent failed (id=${scheduleId}): ${error.message}`);
  }
  // providerMessageId podría guardarse en una columna nueva en el futuro; hoy lo loggeamos
  void providerMessageId;
}

interface MarkFailedParams {
  supabase: SupabaseClient;
  scheduleId: number;
  attempts: number;
  error: string;
}

export async function markScheduleFailed({
  supabase,
  scheduleId,
  attempts,
  error,
}: MarkFailedParams): Promise<void> {
  const { error: dbError } = await supabase
    .from('message_schedules')
    .update({
      status: 'failed',
      attempts,
      last_error: error,
    })
    .eq('id', scheduleId);
  if (dbError) {
    throw new Error(`markScheduleFailed failed (id=${scheduleId}): ${dbError.message}`);
  }
}

interface RescheduleRetryParams {
  supabase: SupabaseClient;
  scheduleId: number;
  attempts: number;
  nextAt: Date;
  error: string;
}

export async function rescheduleForRetry({
  supabase,
  scheduleId,
  attempts,
  nextAt,
  error,
}: RescheduleRetryParams): Promise<void> {
  const { error: dbError } = await supabase
    .from('message_schedules')
    .update({
      status: 'pending',
      attempts,
      scheduled_at: nextAt.toISOString(),
      last_error: error,
    })
    .eq('id', scheduleId);
  if (dbError) {
    throw new Error(`rescheduleForRetry failed (id=${scheduleId}): ${dbError.message}`);
  }
}
