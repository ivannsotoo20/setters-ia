/**
 * Calendar sync (2026-09-12) — sondeo periódico de citas GHL.
 *
 * POR QUÉ EXISTE
 *   Las citas de GHL llegaban al SaaS solo por el webhook `AppointmentCreate` del
 *   app Marketplace (webhook-ghl-calendar.ts). Tania (tenant 7) entra por PIT,
 *   no por el app, así que ese webhook nunca le llega: 0 filas en
 *   `calendar_appointments` en toda su historia mientras sus leads decían "ya he
 *   reservado". Sin cita registrada no hay F7 real, ni handoff A, ni show-rate,
 *   y el dashboard contaba "agendadas" por enlaces enviados.
 *
 * QUÉ HACE
 *   Cada tick, para cada calendario vinculado y activo (`calendar_accounts`):
 *     1. Lista las citas de GHL en una ventana [hoy - daysBack, hoy + daysForward]
 *        con el cliente GHL del tenant (PIT → OAuth → legacy).
 *     2. Cita nueva para nosotros → matchea al lead y la aplica como
 *        `AppointmentCreate` (applier: F7 + handoff A + IA pausada) y avisa a la
 *        entrenadora (email `appointment_booked`), igual que el webhook.
 *     3. Cita conocida con otro estado → `AppointmentUpdate` (cancelada → revoca
 *        el handoff A para que la persona pueda reagendar).
 *     4. Cita conocida sin lead → se reintenta el match (el lead puede haber
 *        aparecido después de la reserva).
 *     5. Cita que teníamos en la ventana y GHL ya no devuelve → `AppointmentDelete`
 *        (GHL filtra las canceladas/eliminadas de /calendars/events). Solo si la
 *        lista vino con algo: una respuesta vacía con filas en BD huele a fallo
 *        transitorio y no se toca nada.
 *
 * Idempotente por `(tenant_id, external_appointment_id)`: repetir un tick sin
 * cambios en GHL no escribe nada. Convive con el webhook: si los dos ven la misma
 * cita, el segundo la encuentra ya creada y no la vuelve a aplicar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlAppointment, GhlClient } from '@fyzon/ghl-client';
import { loadGhlClientByTenant } from '../lib/load-ghl-client.js';
import { matchLeadFromAppointment, type MatchResult } from './appointment-matcher.js';
import { applyAppointmentToConversation } from './appointment-applier.js';
import { buildAppointmentBookedPayload } from './build-appointment-notification-payload.js';
import { enqueueNotification } from './notify-trainer.js';

export interface CalendarSyncLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface CalendarSyncInput {
  supabase: SupabaseClient;
  log: CalendarSyncLogger;
  /** Solo este tenant (scripts / tests). Por defecto, todos los que tengan calendario. */
  tenantId?: number;
  /** Ventana hacia atrás desde `now` (días). Default 3. */
  daysBack?: number;
  /** Ventana hacia delante desde `now` (días). Default 60. */
  daysForward?: number;
  now?: Date;
  /** Inyectable para tests. Default: `loadGhlClientByTenant`. */
  ghlClientFactory?: (tenantId: number) => Promise<GhlClient | null>;
  /** Si false, no se encolan emails a la entrenadora (scripts de backfill). Default true. */
  notify?: boolean;
}

export interface CalendarSyncResult {
  tenantsScanned: number;
  tenantsWithoutClient: number;
  calendarsScanned: number;
  fetched: number;
  created: number;
  updated: number;
  rematched: number;
  cancelled: number;
  unmatched: number;
  errors: string[];
}

interface CalendarAccountRow {
  id: number;
  tenant_id: number;
  external_calendar_id: string;
  name: string | null;
}

interface KnownAppointmentRow {
  id: number;
  external_appointment_id: string;
  external_contact_id: string | null;
  appointment_status: string;
  lead_id: number | null;
  conversation_id: number | null;
  match_method: string | null;
  match_confidence: number | null;
  start_at: string;
  end_at: string;
}

const DEFAULT_DAYS_BACK = 3;
const DEFAULT_DAYS_FORWARD = 60;

export async function syncCalendarAppointments(input: CalendarSyncInput): Promise<CalendarSyncResult> {
  const { supabase, log } = input;
  const now = input.now ?? new Date();
  const daysBack = input.daysBack ?? DEFAULT_DAYS_BACK;
  const daysForward = input.daysForward ?? DEFAULT_DAYS_FORWARD;
  const notify = input.notify ?? true;
  const ghlClientFactory =
    input.ghlClientFactory ?? ((tenantId: number) => loadGhlClientByTenant(supabase, tenantId));

  const result: CalendarSyncResult = {
    tenantsScanned: 0,
    tenantsWithoutClient: 0,
    calendarsScanned: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    rematched: 0,
    cancelled: 0,
    unmatched: 0,
    errors: [],
  };

  const startIso = new Date(now.getTime() - daysBack * 86_400_000).toISOString();
  const endIso = new Date(now.getTime() + daysForward * 86_400_000).toISOString();

  // 1. Calendarios vinculados y activos, agrupados por tenant.
  let query = supabase
    .from('calendar_accounts')
    .select('id, tenant_id, external_calendar_id, name')
    .eq('is_active', true)
    .eq('provider', 'ghl');
  if (input.tenantId != null) query = query.eq('tenant_id', input.tenantId);
  const { data: calendarsRaw, error: calErr } = await query;
  if (calErr) {
    result.errors.push(`calendar_accounts: ${calErr.message}`);
    return result;
  }
  const byTenant = new Map<number, CalendarAccountRow[]>();
  for (const row of (calendarsRaw ?? []) as unknown as CalendarAccountRow[]) {
    const tid = Number(row.tenant_id);
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid)!.push({ ...row, id: Number(row.id), tenant_id: tid });
  }

  for (const [tenantId, calendars] of byTenant.entries()) {
    result.tenantsScanned += 1;
    let ghlClient: GhlClient | null = null;
    try {
      ghlClient = await ghlClientFactory(tenantId);
    } catch (err) {
      result.errors.push(`tenant ${tenantId}: ghl client: ${errMessage(err)}`);
    }
    if (!ghlClient) {
      result.tenantsWithoutClient += 1;
      log.warn({ tenantId }, 'calendar-sync: tenant sin credenciales GHL utilizables — se omite');
      continue;
    }

    for (const calendar of calendars) {
      result.calendarsScanned += 1;
      try {
        await syncOneCalendar({
          supabase,
          ghlClient,
          tenantId,
          calendar,
          startIso,
          endIso,
          notify,
          log,
          result,
        });
      } catch (err) {
        result.errors.push(`tenant ${tenantId} calendar ${calendar.id}: ${errMessage(err)}`);
        log.error(
          { tenantId, calendarAccountId: calendar.id, err: errMessage(err) },
          'calendar-sync: calendar failed',
        );
      }
    }
  }

  return result;
}

async function syncOneCalendar(args: {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  calendar: CalendarAccountRow;
  startIso: string;
  endIso: string;
  notify: boolean;
  log: CalendarSyncLogger;
  result: CalendarSyncResult;
}): Promise<void> {
  const { supabase, ghlClient, tenantId, calendar, startIso, endIso, notify, log, result } = args;

  // 2. Lo que dice GHL.
  const appointments = await ghlClient.listAppointmentsByCalendar(
    calendar.external_calendar_id,
    startIso,
    endIso,
  );
  result.fetched += appointments.length;

  // 3. Lo que sabemos nosotros de esa ventana.
  const { data: knownRaw, error: knownErr } = await supabase
    .from('calendar_appointments')
    .select(
      'id, external_appointment_id, external_contact_id, appointment_status, lead_id, conversation_id, match_method, match_confidence, start_at, end_at',
    )
    .eq('tenant_id', tenantId)
    .eq('calendar_account_id', calendar.id)
    .gte('start_at', startIso)
    .lte('start_at', endIso);
  if (knownErr) throw new Error(`calendar_appointments query: ${knownErr.message}`);
  const known = new Map<string, KnownAppointmentRow>();
  for (const row of (knownRaw ?? []) as unknown as KnownAppointmentRow[]) {
    known.set(String(row.external_appointment_id), row);
  }

  const seen = new Set<string>();
  for (const appointment of appointments) {
    seen.add(appointment.id);
    const status = normalizeStatus(appointment.appointmentStatus);
    const existing = known.get(appointment.id);

    try {
      if (!existing) {
        // 4a. Nueva para nosotros → como si llegara el webhook AppointmentCreate.
        const match = await matchLeadFromAppointment({ supabase, ghlClient, tenantId, appointment });
        const applied = await applyAppointmentToConversation({
          supabase,
          tenantId,
          calendarAccountId: calendar.id,
          eventType: 'AppointmentCreate',
          appointment,
          match,
          rawPayload: appointment,
        });
        result.created += 1;
        if (match.method === 'unmatched') result.unmatched += 1;
        log.info(
          {
            tenantId,
            calendarAccountId: calendar.id,
            appointmentId: appointment.id,
            matchMethod: match.method,
            conversationMoved: applied.conversationMoved,
            newPhase: applied.newPhase,
          },
          'calendar-sync: cita nueva aplicada',
        );
        if (notify && (status === 'new' || status === 'confirmed')) {
          await notifyBooked({ supabase, ghlClient, tenantId, calendarAccountId: calendar.id, appointment, match, log });
        }
        continue;
      }

      const knownStatus = normalizeStatus(existing.appointment_status);
      const existingMatch: MatchResult = {
        leadId: existing.lead_id,
        conversationId: existing.conversation_id,
        method: (existing.match_method as MatchResult['method'] | null) ?? 'unmatched',
        confidence: existing.match_confidence ?? 0,
      };

      if (existing.lead_id == null && existing.conversation_id == null) {
        // 4b. La conocíamos sin lead: quizá el lead apareció después. Se reintenta.
        const match = await matchLeadFromAppointment({ supabase, ghlClient, tenantId, appointment });
        if (match.method !== 'unmatched') {
          await applyAppointmentToConversation({
            supabase,
            tenantId,
            calendarAccountId: calendar.id,
            eventType: 'AppointmentCreate',
            appointment,
            match,
            rawPayload: appointment,
          });
          result.rematched += 1;
          log.info(
            { tenantId, appointmentId: appointment.id, matchMethod: match.method },
            'calendar-sync: cita huérfana ahora casada con un lead',
          );
          continue;
        }
      }

      if (knownStatus !== status) {
        // 4c. Cambió el estado (confirmada, cancelada, no-show…).
        await applyAppointmentToConversation({
          supabase,
          tenantId,
          calendarAccountId: calendar.id,
          eventType: 'AppointmentUpdate',
          appointment,
          match: existingMatch,
          rawPayload: appointment,
        });
        result.updated += 1;
        log.info(
          { tenantId, appointmentId: appointment.id, from: knownStatus, to: status },
          'calendar-sync: estado de cita actualizado',
        );
      }
    } catch (err) {
      result.errors.push(`appointment ${appointment.id}: ${errMessage(err)}`);
    }
  }

  // 5. Reconciliación: en BD dentro de la ventana, viva, y GHL ya no la devuelve.
  if (appointments.length === 0 && known.size > 0) {
    log.warn(
      { tenantId, calendarAccountId: calendar.id, known: known.size },
      'calendar-sync: GHL devolvió 0 citas con filas en BD — no se reconcilia (posible fallo transitorio)',
    );
    return;
  }
  for (const [externalId, row] of known.entries()) {
    if (seen.has(externalId)) continue;
    const knownStatus = normalizeStatus(row.appointment_status);
    if (knownStatus === 'cancelled' || knownStatus === 'invalid') continue;
    try {
      const ghost: GhlAppointment = {
        id: externalId,
        calendarId: calendar.external_calendar_id,
        contactId: row.external_contact_id ?? '',
        appointmentStatus: 'cancelled',
        startTime: row.start_at,
        endTime: row.end_at,
      };
      await applyAppointmentToConversation({
        supabase,
        tenantId,
        calendarAccountId: calendar.id,
        eventType: 'AppointmentDelete',
        appointment: ghost,
        match: {
          leadId: row.lead_id,
          conversationId: row.conversation_id,
          method: (row.match_method as MatchResult['method'] | null) ?? 'unmatched',
          confidence: row.match_confidence ?? 0,
        },
        rawPayload: { reconciled_by: 'calendar-sync', at: new Date().toISOString() },
      });
      result.cancelled += 1;
      log.info({ tenantId, appointmentId: externalId }, 'calendar-sync: cita desaparecida de GHL → cancelada');
    } catch (err) {
      result.errors.push(`reconcile ${externalId}: ${errMessage(err)}`);
    }
  }
}

async function notifyBooked(args: {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  calendarAccountId: number;
  appointment: GhlAppointment;
  match: MatchResult;
  log: CalendarSyncLogger;
}): Promise<void> {
  const { supabase, ghlClient, tenantId, calendarAccountId, appointment, match, log } = args;
  try {
    const payload = await buildAppointmentBookedPayload({
      supabase,
      ghlClient,
      tenantId,
      calendarAccountId,
      appointment,
      match,
    });
    const enq = await enqueueNotification({
      supabase: supabase as unknown as Parameters<typeof enqueueNotification>[0]['supabase'],
      tenantId,
      eventType: 'appointment_booked',
      payload: payload as unknown as Record<string, unknown>,
    });
    if (!enq.ok) {
      log.warn({ tenantId, appointmentId: appointment.id, error: enq.error }, 'calendar-sync: enqueue notification failed (non-fatal)');
    }
  } catch (err) {
    log.warn({ tenantId, appointmentId: appointment.id, err: errMessage(err) }, 'calendar-sync: notification threw (non-fatal)');
  }
}

function normalizeStatus(s: string | null | undefined): string {
  if (!s) return 'new';
  const v = String(s).toLowerCase();
  if (['new', 'confirmed', 'cancelled', 'showed', 'noshow', 'invalid'].includes(v)) return v;
  if (v === 'canceled') return 'cancelled';
  return 'new';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
