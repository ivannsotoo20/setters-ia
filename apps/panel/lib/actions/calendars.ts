'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Hito 10 — Server actions para calendars vinculados al SaaS.
 *
 * Flujo:
 *  - `syncCalendarsFromGhl`: llama al motor `/internal/calendars/sync` con bearer
 *    `INTERNAL_STATS_TOKEN`. El motor refresca OAuth, ensureCustomField y
 *    devuelve la lista de calendars GHL.
 *  - `linkCalendar`: INSERT en `calendar_accounts` para el calendar elegido.
 *  - `setDefaultCalendar`: transacción que limpia is_default=false + setea uno.
 *  - `unlinkCalendar`: UPDATE is_active=false (preserva history).
 *  - `listCalendarAccounts`: lista del tenant para UI.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export type CalendarChannelKind = 'whatsapp' | 'instagram_dm' | 'facebook_messenger' | null;

export interface CalendarAccountRow {
  id: number;
  externalCalendarId: string;
  name: string;
  description: string | null;
  slug: string | null;
  widgetBaseUrl: string;
  isDefault: boolean;
  isActive: boolean;
  /**
   * Hito 11 — Canal al que aplica este calendar. null = aplica a cualquier
   * canal como fallback global. Valor enum DB `channel_type`.
   */
  channelKind: CalendarChannelKind;
  createdAt: string;
}

export interface GhlCalendarRemote {
  externalCalendarId: string;
  name: string;
  description: string | null;
  slug: string | null;
  widgetBaseUrl: string;
  isActiveInGhl: boolean;
}

export interface SyncCalendarsResult {
  customFieldId: string | null;
  calendars: GhlCalendarRemote[];
}

/** Lista calendars locales (vinculados al SaaS). */
export async function listCalendarAccounts(): Promise<ActionResult<CalendarAccountRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name, description, slug, widget_base_url, is_default, is_active, channel_kind, created_at')
    .eq('tenant_id', eff.tenantId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []).map((r) => ({
    id: Number(r.id),
    externalCalendarId: String(r.external_calendar_id),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    slug: (r.slug as string | null) ?? null,
    widgetBaseUrl: String(r.widget_base_url),
    isDefault: Boolean(r.is_default),
    isActive: Boolean(r.is_active),
    channelKind: ((r.channel_kind as CalendarChannelKind | null) ?? null) as CalendarChannelKind,
    createdAt: String(r.created_at),
  }));
  return { ok: true, data: rows };
}

/**
 * Hito 11 — Asigna un canal al calendar (channel_kind). null = "cualquier canal"
 * (fallback global). El UNIQUE parcial parcial idx_calendar_accounts_one_default_per_channel
 * + idx_calendar_accounts_one_default_any garantiza unicidad a nivel DB; aquí
 * hacemos pre-check para devolver mensaje user-friendly antes del violation.
 */
export async function setCalendarChannelKind(
  calendarAccountId: number,
  channelKind: CalendarChannelKind,
): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede asignar canales a calendars' };
  }
  if (
    channelKind != null &&
    channelKind !== 'whatsapp' &&
    channelKind !== 'instagram_dm' &&
    channelKind !== 'facebook_messenger'
  ) {
    return { ok: false, error: 'channel_kind no válido' };
  }

  const supabase = getServiceRoleClient();

  // Verifica que el calendar pertenece al tenant y obtén su estado actual.
  const { data: target } = await supabase
    .from('calendar_accounts')
    .select('id, is_default, is_active, channel_kind')
    .eq('id', calendarAccountId)
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();
  if (!target) {
    return { ok: false, error: 'calendar no encontrado o no pertenece a este tenant' };
  }

  // Pre-check unicidad: si este calendar va a ser default y hay otro default
  // activo con el MISMO channel_kind (incluyendo NULL ↔ NULL), conflicto.
  if (target.is_default && target.is_active) {
    const conflictQuery = supabase
      .from('calendar_accounts')
      .select('id, name')
      .eq('tenant_id', eff.tenantId)
      .eq('is_default', true)
      .eq('is_active', true)
      .neq('id', calendarAccountId);
    const conflictFiltered =
      channelKind == null
        ? conflictQuery.is('channel_kind', null)
        : conflictQuery.eq('channel_kind', channelKind);
    const { data: conflicts } = await conflictFiltered;
    if (conflicts && conflicts.length > 0) {
      const otherName = (conflicts[0] as { name: string }).name;
      const kindLabel = channelKind == null ? 'cualquier canal' : channelKind;
      return {
        ok: false,
        error: `Ya tienes "${otherName}" como calendario default para ${kindLabel}. Quita el default de ese primero o asigna otro canal.`,
      };
    }
  }

  const { error } = await supabase
    .from('calendar_accounts')
    .update({ channel_kind: channelKind, updated_at: new Date().toISOString() })
    .eq('id', calendarAccountId)
    .eq('tenant_id', eff.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/calendars');
  return { ok: true };
}

/** Pide al motor que liste los calendars del GHL del tenant. NO inserta nada. */
export async function syncCalendarsFromGhl(): Promise<ActionResult<SyncCalendarsResult>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede sincronizar calendars' };
  }

  const motorUrl = process.env.MOTOR_INTERNAL_URL || process.env.NEXT_PUBLIC_MOTOR_URL;
  const token = process.env.INTERNAL_STATS_TOKEN;
  if (!motorUrl) return { ok: false, error: 'MOTOR_INTERNAL_URL no configurado' };
  if (!token) return { ok: false, error: 'INTERNAL_STATS_TOKEN no configurado' };

  let response: Response;
  try {
    response = await fetch(`${motorUrl.replace(/\/$/, '')}/internal/calendars/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenant_id: eff.tenantId }),
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, error: `motor unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  const json = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        message?: string;
        custom_field_id?: string | null;
        calendars?: GhlCalendarRemote[];
      }
    | null;

  if (!response.ok || !json?.ok) {
    return {
      ok: false,
      error:
        json?.message || json?.error || `motor responded ${response.status}: ${response.statusText}`,
    };
  }

  return {
    ok: true,
    data: {
      customFieldId: json.custom_field_id ?? null,
      calendars: Array.isArray(json.calendars) ? json.calendars : [],
    },
  };
}

/** Vincula un calendar GHL al SaaS (INSERT calendar_accounts). Si ya existe, no-op. */
export async function linkCalendar(input: {
  externalCalendarId: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  widgetBaseUrl: string;
}): Promise<ActionResult<{ id: number }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede vincular calendars' };
  }
  if (!input.externalCalendarId || !input.name || !input.widgetBaseUrl) {
    return { ok: false, error: 'externalCalendarId, name y widgetBaseUrl son requeridos' };
  }

  // Hardening 2026-05-15 audit MEDIUM M-4: validar widget_base_url es https://.
  // El widget URL proviene de GHL sync (motor) o input del trainer; defensivo
  // rechazar protocols peligrosos (javascript:, data:) antes de persistir.
  try {
    const { assertHttpsUrl } = await import('@/lib/validators/url');
    assertHttpsUrl(input.widgetBaseUrl, 'widgetBaseUrl');
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = getServiceRoleClient();

  // Resolver integration_account_id GHL del tenant
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('tenant_id', eff.tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .maybeSingle();
  if (iaErr || !ia) {
    return { ok: false, error: 'no hay integration_account GHL activa para este tenant' };
  }

  // Si ya existe (UNIQUE tenant_id,external_calendar_id), reactivar
  const { data: existing } = await supabase
    .from('calendar_accounts')
    .select('id, is_active')
    .eq('tenant_id', eff.tenantId)
    .eq('external_calendar_id', input.externalCalendarId)
    .maybeSingle();

  if (existing) {
    const { error: updErr } = await supabase
      .from('calendar_accounts')
      .update({
        name: input.name,
        description: input.description ?? null,
        slug: input.slug ?? null,
        widget_base_url: input.widgetBaseUrl,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updErr) return { ok: false, error: updErr.message };
    revalidatePath('/settings/calendars');
    revalidatePath('/calendars');
    return { ok: true, data: { id: Number(existing.id) } };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('calendar_accounts')
    .insert({
      tenant_id: eff.tenantId,
      integration_account_id: Number(ia.id),
      provider: 'ghl',
      external_calendar_id: input.externalCalendarId,
      name: input.name,
      description: input.description ?? null,
      slug: input.slug ?? null,
      widget_base_url: input.widgetBaseUrl,
      is_active: true,
      is_default: false,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? 'insert failed' };
  }
  revalidatePath('/settings/calendars');
  revalidatePath('/calendars');
  return { ok: true, data: { id: Number(inserted.id) } };
}

/** Marca un calendar como default (clear all + set this). */
export async function setDefaultCalendar(calendarAccountId: number): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede cambiar el calendar default' };
  }

  const supabase = getServiceRoleClient();
  // 1. clear default actual
  const { error: clrErr } = await supabase
    .from('calendar_accounts')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', eff.tenantId)
    .eq('is_default', true);
  if (clrErr) return { ok: false, error: clrErr.message };
  // 2. set nuevo default (verifica ownership por tenant_id)
  const { error: setErr } = await supabase
    .from('calendar_accounts')
    .update({ is_default: true, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', calendarAccountId)
    .eq('tenant_id', eff.tenantId);
  if (setErr) return { ok: false, error: setErr.message };
  revalidatePath('/settings/calendars');
  revalidatePath('/calendars');
  return { ok: true };
}

/** Desvincula (soft) un calendar (is_active=false). Preserva appointments históricos. */
export async function unlinkCalendar(calendarAccountId: number): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede desvincular calendars' };
  }

  const supabase = getServiceRoleClient();

  // Hardening 2026-05-15 (audit MEDIUM M-9): registrar en audit log antes del
  // soft-delete para trazabilidad. Si el UPDATE falla, el audit log también
  // queda y permite forense.
  const { data: target } = await supabase
    .from('calendar_accounts')
    .select('name, external_calendar_id, is_default')
    .eq('id', calendarAccountId)
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();

  if (!target) {
    return { ok: false, error: 'calendar no encontrado o no pertenece a este tenant' };
  }

  const { error } = await supabase
    .from('calendar_accounts')
    .update({ is_active: false, is_default: false, updated_at: new Date().toISOString() })
    .eq('id', calendarAccountId)
    .eq('tenant_id', eff.tenantId);
  if (error) return { ok: false, error: error.message };

  // Audit log (best-effort, non-fatal si falla)
  await supabase.from('tenant_audit_log').insert({
    tenant_id: eff.tenantId,
    actor_user_id: eff.userId,
    action: 'calendar.unlink',
    metadata: {
      calendar_account_id: calendarAccountId,
      external_calendar_id: target.external_calendar_id,
      name: target.name,
      was_default: target.is_default,
    },
  });

  revalidatePath('/settings/calendars');
  revalidatePath('/calendars');
  return { ok: true };
}

export interface BackfillSummary {
  fetched: number;
  upserted: number;
  matched: number;
  unmatched: number;
  errorsCount: number;
  calendars: Array<{
    calendarId: number;
    calendarName: string;
    fetched: number;
    upserted: number;
    matched: number;
    unmatched: number;
  }>;
}

/** Importa citas existentes de GHL al SaaS (últimos N días + próximos N días). */
export async function backfillAppointments(input: {
  calendarAccountId?: number;
  daysBack?: number;
  daysForward?: number;
}): Promise<ActionResult<BackfillSummary>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede importar citas' };
  }

  const motorUrl = process.env.MOTOR_INTERNAL_URL || process.env.NEXT_PUBLIC_MOTOR_URL;
  const token = process.env.INTERNAL_STATS_TOKEN;
  if (!motorUrl) return { ok: false, error: 'MOTOR_INTERNAL_URL no configurado' };
  if (!token) return { ok: false, error: 'INTERNAL_STATS_TOKEN no configurado' };

  let response: Response;
  try {
    response = await fetch(`${motorUrl.replace(/\/$/, '')}/internal/calendars/backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tenant_id: eff.tenantId,
        calendar_account_id: input.calendarAccountId,
        days_back: input.daysBack ?? 90,
        days_forward: input.daysForward ?? 90,
      }),
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, error: `motor unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  interface RawCalendarSummary {
    calendar_id: number;
    calendar_name: string;
    fetched: number;
    upserted: number;
    matched: number;
    unmatched: number;
  }
  const json = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        message?: string;
        total?: { fetched: number; upserted: number; matched: number; unmatched: number };
        calendars?: RawCalendarSummary[];
        errors?: string[];
      }
    | null;

  if (!response.ok || !json?.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || `motor responded ${response.status}`,
    };
  }

  revalidatePath('/calendars');
  revalidatePath('/settings/calendars');
  return {
    ok: true,
    data: {
      fetched: json.total?.fetched ?? 0,
      upserted: json.total?.upserted ?? 0,
      matched: json.total?.matched ?? 0,
      unmatched: json.total?.unmatched ?? 0,
      errorsCount: Array.isArray(json.errors) ? json.errors.length : 0,
      calendars: (json.calendars ?? []).map((c) => ({
        calendarId: c.calendar_id,
        calendarName: c.calendar_name,
        fetched: c.fetched,
        upserted: c.upserted,
        matched: c.matched,
        unmatched: c.unmatched,
      })),
    },
  };
}

export interface AppointmentRow {
  id: number;
  externalAppointmentId: string;
  calendarAccountId: number;
  calendarName: string;
  title: string | null;
  startAt: string;
  endAt: string;
  appointmentStatus: 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'invalid';
  leadId: number | null;
  leadFirstName: string | null;
  leadPhone: string | null;
  leadUsername: string | null;
  conversationId: number | null;
  channelType: string | null;
  matchMethod: string | null;
  source: string | null;
}

/** Lista appointments del tenant entre dos fechas. */
export async function listAppointments(input: {
  rangeStart: string;
  rangeEnd: string;
  calendarAccountId?: number | null;
  status?: AppointmentRow['appointmentStatus'] | null;
}): Promise<ActionResult<AppointmentRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  let q = supabase
    .from('calendar_appointments')
    .select(
      `
      id,
      external_appointment_id,
      calendar_account_id,
      title,
      start_at,
      end_at,
      appointment_status,
      lead_id,
      conversation_id,
      source,
      match_method,
      calendar_accounts:calendar_account_id(name),
      leads:lead_id(first_name, phone, username),
      conversations:conversation_id(channel_id, channels:channel_id(channel_type))
    `,
    )
    .eq('tenant_id', eff.tenantId)
    .gte('start_at', input.rangeStart)
    .lte('start_at', input.rangeEnd)
    .order('start_at', { ascending: true });

  if (input.calendarAccountId) q = q.eq('calendar_account_id', input.calendarAccountId);
  if (input.status) q = q.eq('appointment_status', input.status);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  interface RawRow {
    id: number;
    external_appointment_id: string;
    calendar_account_id: number;
    title: string | null;
    start_at: string;
    end_at: string;
    appointment_status: string;
    lead_id: number | null;
    conversation_id: number | null;
    source: string | null;
    match_method: string | null;
    calendar_accounts: { name: string } | null;
    leads: { first_name: string | null; phone: string | null; username: string | null } | null;
    conversations: { channels: { channel_type: string } | null } | null;
  }

  const rows = ((data as unknown as RawRow[]) ?? []).map((r) => ({
    id: Number(r.id),
    externalAppointmentId: String(r.external_appointment_id),
    calendarAccountId: Number(r.calendar_account_id),
    calendarName: r.calendar_accounts?.name ?? '—',
    title: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    appointmentStatus: r.appointment_status as AppointmentRow['appointmentStatus'],
    leadId: r.lead_id != null ? Number(r.lead_id) : null,
    leadFirstName: r.leads?.first_name ?? null,
    leadPhone: r.leads?.phone ?? null,
    leadUsername: r.leads?.username ?? null,
    conversationId: r.conversation_id != null ? Number(r.conversation_id) : null,
    channelType: r.conversations?.channels?.channel_type ?? null,
    matchMethod: r.match_method,
    source: r.source,
  }));

  return { ok: true, data: rows };
}
