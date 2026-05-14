/**
 * Webhook handler GHL calendar events (Hito 10).
 *
 * No expone una ruta propia: se invoca desde `webhook-ghl.ts` (endpoint
 * `/integrations/webhook/oauth`) cuando el `body.type` es uno de:
 *   - AppointmentCreate
 *   - AppointmentUpdate
 *   - AppointmentDelete
 *
 * Flujo:
 *   1. Validar shape del payload (zod parser local — los marketplace events tienen
 *      shape distinto que InboundMessage/OutboundMessage que parseGhlWebhookPayload espera).
 *   2. Resolver tenant por locationId (resolveTenantByOauthLocation — ya hecho fuera).
 *   3. Dedup Redis por (tenantId, appointment.id, eventType).
 *   4. Cargar calendar_account vinculado al SaaS (ignorar si no existe).
 *   5. Cargar GhlClient + matchLeadFromAppointment.
 *   6. applyAppointmentToConversation.
 *   7. touchIntegrationLastWebhook + return.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { GhlAppointment, GhlClient } from '@fyzon/ghl-client';
import { tryClaimDedupKey } from '../lib/redis.js';
import { touchIntegrationLastWebhook } from '../lib/touch-integration.js';
import {
  matchLeadFromAppointment,
} from '../services/appointment-matcher.js';
import {
  applyAppointmentToConversation,
  type AppointmentEventType,
} from '../services/appointment-applier.js';

export const CALENDAR_EVENT_TYPES = new Set<AppointmentEventType>([
  'AppointmentCreate',
  'AppointmentUpdate',
  'AppointmentDelete',
]);

export function isCalendarEventType(value: unknown): value is AppointmentEventType {
  return typeof value === 'string' && CALENDAR_EVENT_TYPES.has(value as AppointmentEventType);
}

const appointmentSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().optional(),
  calendarId: z.string().min(1),
  contactId: z.string().min(1),
  groupId: z.string().nullish(),
  appointmentStatus: z
    .string()
    .nullish()
    .transform((v) => v ?? 'new'),
  assignedUserId: z.string().nullish(),
  users: z.array(z.string()).optional(),
  notes: z.string().nullish(),
  title: z.string().nullish(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  source: z.string().nullish(),
  address: z.string().nullish(),
  dateAdded: z.string().optional(),
  dateUpdated: z.string().optional(),
  customFields: z
    .array(
      z.object({
        id: z.string().optional(),
        key: z.string().optional(),
        value: z.string(),
      }),
    )
    .optional(),
});

const calendarEventSchema = z.object({
  type: z.enum(['AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete']),
  locationId: z.string().min(1),
  appointment: appointmentSchema,
});

export type CalendarEventPayload = z.infer<typeof calendarEventSchema>;

export interface HandleCalendarEventResult {
  ok: boolean;
  deduped?: boolean;
  ignored?: boolean;
  reason?: string;
  appointmentLocalId?: number;
  matchMethod?: string;
  matchConfidence?: number;
  conversationMoved?: boolean;
  previousPhase?: number | null;
  newPhase?: number | null;
}

export interface HandleCalendarEventInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient | null;
  tenantId: number;
  body: unknown;
  log: FastifyBaseLogger;
}

/**
 * Parsea un body de calendar webhook + lo procesa. Devuelve un resultado seguro de
 * serializar para el ack. NUNCA lanza al caller (siempre devuelve un objeto con `ok`).
 */
export async function handleCalendarEvent(
  input: HandleCalendarEventInput,
): Promise<HandleCalendarEventResult> {
  const { supabase, ghlClient, tenantId, body, log } = input;

  // 1. Parse payload calendar
  const parsed = calendarEventSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { tenantId, issues: parsed.error.flatten() },
      'webhook-ghl-calendar: invalid payload',
    );
    return { ok: false, ignored: true, reason: 'invalid_payload' };
  }
  const event = parsed.data;
  const appointment = event.appointment as GhlAppointment;
  const eventType = event.type;

  // 2. Dedup Redis
  const dedupKey = `ghl:appt:${tenantId}:${appointment.id}:${eventType}`;
  const claimed = await tryClaimDedupKey(dedupKey, 60);
  if (!claimed) {
    return { ok: true, deduped: true };
  }

  // 3. Cargar calendar_account vinculado
  const { data: calAcct, error: calErr } = await supabase
    .from('calendar_accounts')
    .select('id, is_active')
    .eq('tenant_id', tenantId)
    .eq('external_calendar_id', appointment.calendarId)
    .eq('is_active', true)
    .maybeSingle();
  if (calErr) {
    log.error({ err: calErr, tenantId }, 'webhook-ghl-calendar: calendar_accounts query failed');
    return { ok: false, reason: 'calendar_account_query_failed' };
  }
  if (!calAcct) {
    // Calendar GHL no vinculado en el SaaS. Ignorar silenciosamente — el trainer
    // puede vincularlo después desde /settings/calendars.
    log.info(
      { tenantId, calendarId: appointment.calendarId },
      'webhook-ghl-calendar: calendar not linked — ignored',
    );
    return { ok: true, ignored: true, reason: 'calendar_not_linked' };
  }
  const calendarAccountId = Number(calAcct.id);

  // 4. Matchear lead
  const match = await matchLeadFromAppointment({
    supabase,
    ghlClient,
    tenantId,
    appointment,
  });

  // 5. Aplicar a BD
  const result = await applyAppointmentToConversation({
    supabase,
    tenantId,
    calendarAccountId,
    eventType,
    appointment,
    match,
    rawPayload: body,
  });

  // 6. Touch last_webhook_at
  try {
    await touchIntegrationLastWebhook(supabase, tenantId, 'ghl');
  } catch (err) {
    log.warn({ err, tenantId }, 'webhook-ghl-calendar: touch_last_webhook failed (non-fatal)');
  }

  return {
    ok: true,
    appointmentLocalId: result.appointmentLocalId,
    matchMethod: match.method,
    matchConfidence: match.confidence,
    conversationMoved: result.conversationMoved,
    previousPhase: result.previousPhase,
    newPhase: result.newPhase,
  };
}
