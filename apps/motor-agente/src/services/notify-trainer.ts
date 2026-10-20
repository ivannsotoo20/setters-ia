import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';
import { sendEmail, type SendEmailResult } from '../lib/email.js';
import {
  AGENCY_NOTIFICATION_EVENT_TYPES,
  renderAgencyEmailTemplate,
  renderEmailTemplate,
  type AgencyNotificationEventType,
  type NotificationEventType,
  type RenderedEmail,
} from '../lib/email-templates.js';

/**
 * Notificaciones email al trainer (Sprint Gamma 2.4).
 *
 * Patrón:
 *   1. Pipelines/hooks llaman `enqueueNotification({tenantId, eventType, payload})`
 *      → INSERT en notification_events status='pending'.
 *   2. Cron `notify-tick` cada 10s llama `processNotificationQueue(deps)` →
 *      lee pending vencidos → para cada uno: lee trainer_preferences (email +
 *      subscriptions), si suscrito → renderiza template → sendEmail → marca
 *      sent/failed.
 *
 * Retry policy: 3 intentos con backoff [1m, 5m, 30m]. Tras 3 fallos → status='failed'.
 *
 * Avisos técnicos (`error_motor`, 2026-10-20, p. ej. la alerta de IA muda): no
 * van al trainer sino a los agency admins activos (`profiles.is_agency_admin`),
 * sin mirar suscripciones.
 *
 * Skip si:
 *   - Trainer sin trainerEmail configurado.
 *   - Trainer no suscrito al event_type (default subscriptions = ['handoff', 'appointment_booked']).
 */

const RETRY_BACKOFFS_MS = [60_000, 5 * 60_000, 30 * 60_000]; // 1m, 5m, 30m
const MAX_ATTEMPTS = RETRY_BACKOFFS_MS.length;
const DEFAULT_SUBSCRIPTIONS: NotificationEventType[] = ['handoff', 'appointment_booked'];

type SupabaseTyped = SupabaseClient<Database>;

export interface EnqueueArgs {
  supabase: SupabaseTyped;
  tenantId: number;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
}

export async function enqueueNotification(
  args: EnqueueArgs,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const { data, error } = await args.supabase
    .from('notification_events')
    .insert({
      tenant_id: args.tenantId,
      event_type: args.eventType,
      payload: args.payload as Database['public']['Tables']['notification_events']['Insert']['payload'],
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert failed' };
  }
  return { ok: true, id: data.id as number };
}

interface ProcessDeps {
  supabase: SupabaseTyped;
  /** Override del fetch para tests. */
  fetchImpl?: typeof fetch;
  /** Logger Fastify-style; opcional, si no se pasa usa console. */
  log?: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void };
  /** Override del clock para tests. */
  now?: () => Date;
  /** Limit de notificaciones a procesar por tick. Default 20. */
  batchSize?: number;
}

export interface ProcessResult {
  picked: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
}

export async function processNotificationQueue(deps: ProcessDeps): Promise<ProcessResult> {
  const now = (deps.now ?? (() => new Date()))();
  const batchSize = deps.batchSize ?? 20;
  const log = deps.log ?? {
    info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
    warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
    error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
  };

  // 1. Pick pending vencidos
  const { data: pending, error: pickErr } = await deps.supabase
    .from('notification_events')
    .select('id, tenant_id, event_type, payload, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(batchSize);

  if (pickErr) {
    log.error({ err: pickErr.message }, 'notify-trainer: pick failed');
    return { picked: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  }

  const result: ProcessResult = { picked: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  const rows = pending ?? [];
  result.picked = rows.length;

  for (const row of rows) {
    const eventType = row.event_type as NotificationEventType;
    const tenantId = row.tenant_id as number;

    try {
      let recipients: string[];
      let rendered: RenderedEmail;

      if (AGENCY_NOTIFICATION_EVENT_TYPES.has(row.event_type as string)) {
        // 2026-10-20 — avisos técnicos (error_motor, p. ej. IA muda): van a los
        // agency admins (Iván), no al entrenador, y sin suscripción que valga.
        recipients = await loadAgencyAdminEmails(deps.supabase);
        if (recipients.length === 0) {
          await markSkipped(deps.supabase, row.id as number, 'sin agency admin activo con email');
          result.skipped++;
          continue;
        }
        rendered = renderAgencyEmailTemplate(row.event_type as AgencyNotificationEventType, {
          tenantName: await loadTenantName(deps.supabase, tenantId),
          payload: (row.payload as Record<string, unknown>) ?? {},
        });
      } else {
        // 2. Lee trainer_preferences (para email + subscriptions)
        const { data: prefsRow } = await deps.supabase
          .from('trainer_preferences')
          .select('preferences')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        const prefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>;
        const trainerEmail = typeof prefs.trainerEmail === 'string' ? prefs.trainerEmail : null;
        const trainerName =
          typeof prefs.trainerName === 'string' && prefs.trainerName.trim() !== ''
            ? prefs.trainerName.trim()
            : null;
        const subscriptions = Array.isArray(prefs.notificationSubscriptions)
          ? (prefs.notificationSubscriptions as string[])
          : DEFAULT_SUBSCRIPTIONS;

        // Skip si sin email o no suscrito
        if (!trainerEmail) {
          await markSkipped(deps.supabase, row.id as number, 'trainer sin email configurado');
          result.skipped++;
          continue;
        }
        if (!subscriptions.includes(eventType)) {
          await markSkipped(deps.supabase, row.id as number, `no suscrito a '${eventType}'`);
          result.skipped++;
          continue;
        }

        // 3. Lee tenant.name
        const tenantName = await loadTenantName(deps.supabase, tenantId);

        // 4. Renderiza template (Sprint 2.5b/A: incluye trainerName para saludo personalizado)
        rendered = renderEmailTemplate(eventType, {
          tenantName,
          payload: (row.payload as Record<string, unknown>) ?? {},
          trainerName,
        });
        recipients = [trainerEmail];
      }

      // 5. Send vía Resend. Con varios destinatarios (agency admins) basta con
      //    que llegue a uno; si no llega a ninguno, cuenta el último error.
      let sendResult: SendEmailResult = { ok: false, error: 'sin destinatarios' };
      let delivered: SendEmailResult | null = null;
      for (const to of recipients) {
        sendResult = await sendEmail({
          to,
          subject: rendered.subject,
          html: rendered.html,
          fetchImpl: deps.fetchImpl,
        });
        if (sendResult.ok && !delivered) delivered = sendResult;
      }
      if (delivered) sendResult = delivered;

      if (sendResult.ok) {
        await deps.supabase
          .from('notification_events')
          .update({
            status: 'sent',
            sent_at: now.toISOString(),
            resend_message_id: sendResult.id,
            attempts: (row.attempts as number) + 1,
          })
          .eq('id', row.id as number);
        result.sent++;
        log.info(
          { eventId: row.id, eventType, tenantId, resendId: sendResult.id },
          'notify-trainer: sent',
        );
      } else {
        // Retry o failed
        const newAttempts = (row.attempts as number) + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          await markFailed(deps.supabase, row.id as number, sendResult.error, newAttempts);
          result.failed++;
          log.error(
            { eventId: row.id, eventType, tenantId, attempts: newAttempts, error: sendResult.error },
            'notify-trainer: gave up after max attempts',
          );
        } else {
          const backoffMs = RETRY_BACKOFFS_MS[newAttempts] ?? RETRY_BACKOFFS_MS[RETRY_BACKOFFS_MS.length - 1]!;
          const nextAt = new Date(now.getTime() + backoffMs);
          await deps.supabase
            .from('notification_events')
            .update({
              attempts: newAttempts,
              last_error: sendResult.error,
              next_attempt_at: nextAt.toISOString(),
            })
            .eq('id', row.id as number);
          result.retried++;
          log.warn(
            { eventId: row.id, eventType, tenantId, attempts: newAttempts, nextAt, error: sendResult.error },
            'notify-trainer: retry scheduled',
          );
        }
      }
    } catch (err) {
      // Error inesperado en el procesamiento (no en el send) — marca failed.
      log.error({ err, eventId: row.id }, 'notify-trainer: unexpected error');
      await markFailed(
        deps.supabase,
        row.id as number,
        `unexpected: ${(err as Error).message}`,
        (row.attempts as number) + 1,
      );
      result.failed++;
    }
  }

  return result;
}

async function loadTenantName(supabase: SupabaseTyped, tenantId: number): Promise<string> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();
  return (tenant?.name as string | undefined) ?? `Tenant #${tenantId}`;
}

/** Emails de los agency admins activos (Iván): destino de los avisos técnicos. */
async function loadAgencyAdminEmails(supabase: SupabaseTyped): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('is_agency_admin', true)
    .eq('is_active', true);
  if (error) throw new Error(`load agency admins: ${error.message}`);
  const emails = (data ?? [])
    .map((p) => (typeof p.email === 'string' ? p.email.trim() : ''))
    .filter((e) => e.length > 0);
  return [...new Set(emails)];
}

async function markSkipped(
  supabase: SupabaseTyped,
  id: number,
  reason: string,
): Promise<void> {
  await supabase
    .from('notification_events')
    .update({ status: 'skipped', last_error: reason })
    .eq('id', id);
}

async function markFailed(
  supabase: SupabaseTyped,
  id: number,
  reason: string,
  attempts: number,
): Promise<void> {
  await supabase
    .from('notification_events')
    .update({ status: 'failed', last_error: reason, attempts })
    .eq('id', id);
}
