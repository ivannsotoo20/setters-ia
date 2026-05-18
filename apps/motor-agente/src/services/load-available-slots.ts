/**
 * Hito 10.6 + Hito 11 — Carga slots disponibles del calendar resuelto para
 * el canal de la conversación + renderiza la etiqueta humana en la timezone
 * del LEAD (no del trainer).
 *
 * Llamado por el caller del pipeline (motor) ANTES de runPipeline cuando el
 * tenant tiene `schedulingMode='direct'` y la conv está en F5+. El resultado se
 * pasa a `composePrompt.options.availableSlots` para que el placeholder
 * `{{available_slots|...}}` de fase_6_v4 quede resuelto.
 *
 * Resolución del calendar (Hito 11):
 *   1. Si `channelKind` viene, busca primero `WHERE channel_kind = $kind AND is_default=true AND is_active=true`.
 *   2. Si no hay match, fallback a `WHERE channel_kind IS NULL AND is_default=true AND is_active=true`.
 *   3. Si tampoco, devuelve null y composer cae al fallback del placeholder.
 *
 * Timezones (Hito 11):
 *   - `trainerTimezone`: se pasa a GHL getFreeSlots (la disponibilidad del
 *     trainer se calcula en SU zona — los slots vuelven con offset).
 *   - `leadTimezone`: se usa para renderizar `humanLabel` (lo que el setter
 *     muestra al lead en chat). Si null, cae a `trainerTimezone`.
 *   - El `iso` que el setter rellena en `proposed_booking_slot` es el ISO 8601
 *     con offset del slot (independiente de en qué zona se renderiza el label).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlClient, GhlFreeSlot } from '@fyzon/ghl-client';
import { logger } from '../lib/logger.js';

/** Enum DB `channel_type`: whatsapp / instagram_dm / facebook_messenger. */
export type ChannelKind = 'whatsapp' | 'instagram_dm' | 'facebook_messenger';

export interface LoadAvailableSlotsInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  /** Días hacia el futuro a consultar. Default 14. */
  daysForward?: number;
  /** Slots máximos a devolver (recorta los más próximos). Default 8. */
  maxSlots?: number;
  /**
   * Timezone IANA del trainer. Se pasa a GHL getFreeSlots para calcular la
   * disponibilidad en su zona horaria. Default 'Europe/Madrid'.
   */
  trainerTimezone?: string;
  /**
   * Timezone IANA del lead (inferida por prefijo phone o configurada). Se usa
   * para renderizar la etiqueta humana del slot ("martes 19 may, 13:00" en
   * hora del lead). Si null, cae a `trainerTimezone`.
   */
  leadTimezone?: string | null;
  /**
   * Canal de la conversación (channels.channel_type). Si viene, se intenta
   * resolver primero el calendar `channel_kind=<kind>`; si no, fallback
   * `channel_kind IS NULL`.
   */
  channelKind?: ChannelKind | null;
}

export interface AvailableSlot {
  /** ISO 8601 con offset (lo que pasamos a createAppointment.startTime). */
  iso: string;
  /** Etiqueta legible en es-ES en hora del lead (ej: "lunes 19 may, 17:00"). */
  humanLabel: string;
}

/**
 * Devuelve los próximos N slots disponibles del calendar resuelto.
 * Devuelve null si no se pudo cargar (no fatal — pipeline continúa sin slots).
 */
export async function loadAvailableSlots(
  input: LoadAvailableSlotsInput,
): Promise<AvailableSlot[] | null> {
  const {
    supabase,
    ghlClient,
    tenantId,
    daysForward = 14,
    maxSlots = 8,
    trainerTimezone = 'Europe/Madrid',
    leadTimezone = null,
    channelKind = null,
  } = input;

  // 1. Resolver calendar default jerárquico: primero por canal, luego any.
  const cal = await resolveDefaultCalendar(supabase, tenantId, channelKind);
  if (!cal?.external_calendar_id) {
    return null;
  }

  // 2. Llamar GHL getFreeSlots + flatten — usamos timezone del trainer (su
  //    disponibilidad se computa en su zona).
  const now = Date.now();
  const endMs = now + daysForward * 24 * 60 * 60 * 1000;

  let flatSlots: GhlFreeSlot[];
  try {
    flatSlots = await ghlClient.getFreeSlotsFlat(String(cal.external_calendar_id), {
      startDate: now,
      endDate: endMs,
      timezone: trainerTimezone,
      maxSlots,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), tenantId },
      'loadAvailableSlots: GHL getFreeSlots failed',
    );
    return null;
  }

  if (flatSlots.length === 0) return null;

  // 3. Renderizar humanLabel EN HORA DEL LEAD (fallback al trainer si lead null).
  const labelTimezone = leadTimezone ?? trainerTimezone;
  return flatSlots.map((s) => ({
    iso: s.iso,
    humanLabel: renderHumanLabel(s.iso, labelTimezone),
  }));
}

/**
 * Resolución jerárquica del calendar default activo para un tenant:
 *   1. Si `channelKind` viene: `WHERE tenant_id AND channel_kind = $kind AND is_default AND is_active`.
 *   2. Fallback `WHERE tenant_id AND channel_kind IS NULL AND is_default AND is_active`.
 *
 * Exportada para reutilización en `tracked-calendar-url.ts` y `book-appointment-from-slot.ts`.
 */
export async function resolveDefaultCalendar(
  supabase: SupabaseClient,
  tenantId: number,
  channelKind: ChannelKind | null,
): Promise<{ id: number; external_calendar_id: string; name: string | null; widget_base_url: string | null } | null> {
  const baseQuery = supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name, widget_base_url')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true);

  // 1. Intentar por canal específico (si viene)
  if (channelKind) {
    const { data: byChannel, error: byChannelErr } = await baseQuery
      .eq('channel_kind', channelKind)
      .maybeSingle();
    if (byChannelErr) {
      logger.warn(
        { err: byChannelErr.message, tenantId, channelKind },
        'resolveDefaultCalendar: query by channel_kind failed',
      );
      return null;
    }
    if (byChannel) {
      return {
        id: Number(byChannel.id),
        external_calendar_id: String(byChannel.external_calendar_id),
        name: (byChannel.name as string | null) ?? null,
        widget_base_url: (byChannel.widget_base_url as string | null) ?? null,
      };
    }
  }

  // 2. Fallback: channel_kind IS NULL ("cualquier canal").
  const fallbackQuery = supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id, name, widget_base_url')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .is('channel_kind', null);
  const { data: anyCal, error: anyErr } = await fallbackQuery.maybeSingle();
  if (anyErr) {
    logger.warn(
      { err: anyErr.message, tenantId },
      'resolveDefaultCalendar: fallback any query failed',
    );
    return null;
  }
  if (!anyCal) return null;
  return {
    id: Number(anyCal.id),
    external_calendar_id: String(anyCal.external_calendar_id),
    name: (anyCal.name as string | null) ?? null,
    widget_base_url: (anyCal.widget_base_url as string | null) ?? null,
  };
}

/**
 * Renderiza un ISO 8601 como "lunes 19 may, 17:00" en español.
 * Si Intl falla (timezone inválida, fecha mala), devuelve el ISO como fallback.
 */
function renderHumanLabel(iso: string, timezone: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const dayName = new Intl.DateTimeFormat('es-ES', {
      timeZone: timezone,
      weekday: 'long',
    }).format(d);
    const dayNumMonth = new Intl.DateTimeFormat('es-ES', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
    }).format(d);
    const time = new Intl.DateTimeFormat('es-ES', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);

    return `${dayName} ${dayNumMonth}, ${time}`;
  } catch {
    return iso;
  }
}

/**
 * Helper para formatear el bloque markdown que va al prompt.
 * Cada slot como bullet. Si vacío, devuelve string vacío.
 */
export function renderSlotsBlock(slots: AvailableSlot[] | null | undefined): string {
  if (!slots || slots.length === 0) return '';
  return slots.map((s) => `- ${s.humanLabel}  (${s.iso})`).join('\n');
}

/** Test-only export. */
export { renderHumanLabel as __renderHumanLabelForTest };
