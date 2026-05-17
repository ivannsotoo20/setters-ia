/**
 * Hito 10.6 — Carga slots disponibles del calendar default del tenant.
 *
 * Llamado por el caller del pipeline (motor) ANTES de runPipeline cuando el
 * tenant tiene `useApiBooking=true` y la conv está en F5+. El resultado se
 * pasa a `composePrompt.options.availableSlots` para que el placeholder
 * `{{available_slots|...}}` de fase_6_v4 quede resuelto.
 *
 * Si no hay calendar default vinculado, GHL falla, o no hay slots → devuelve
 * null y composer cae al fallback del placeholder.
 *
 * El `humanLabel` se renderiza en es-ES con timezone Europe/Madrid (MVP
 * hardcoded; futuro: leer del trainer_preferences.timezone).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlClient, GhlFreeSlot } from '@fyzon/ghl-client';
import { logger } from '../lib/logger.js';

export interface LoadAvailableSlotsInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient;
  tenantId: number;
  /** Días hacia el futuro a consultar. Default 14. */
  daysForward?: number;
  /** Slots máximos a devolver (recorta los más próximos). Default 8. */
  maxSlots?: number;
  /** Timezone para renderizar humanLabel. Default Europe/Madrid. */
  timezone?: string;
}

export interface AvailableSlot {
  /** ISO 8601 con offset (lo que pasamos a createAppointment.startTime). */
  iso: string;
  /** Etiqueta legible en es-ES (ej: "lunes 19 may, 17:00"). */
  humanLabel: string;
}

/**
 * Devuelve los próximos N slots disponibles del calendar default del tenant.
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
    timezone = 'Europe/Madrid',
  } = input;

  // 1. Cargar calendar default
  const { data: cal, error: calErr } = await supabase
    .from('calendar_accounts')
    .select('id, external_calendar_id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (calErr) {
    logger.warn(
      { err: calErr.message, tenantId },
      'loadAvailableSlots: calendar_accounts query failed',
    );
    return null;
  }
  if (!cal?.external_calendar_id) {
    return null;
  }

  // 2. Llamar GHL getFreeSlots + flatten
  const now = Date.now();
  const endMs = now + daysForward * 24 * 60 * 60 * 1000;

  let flatSlots: GhlFreeSlot[];
  try {
    flatSlots = await ghlClient.getFreeSlotsFlat(String(cal.external_calendar_id), {
      startDate: now,
      endDate: endMs,
      timezone,
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

  // 3. Renderizar humanLabel
  return flatSlots.map((s) => ({
    iso: s.iso,
    humanLabel: renderHumanLabel(s.iso, timezone),
  }));
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
