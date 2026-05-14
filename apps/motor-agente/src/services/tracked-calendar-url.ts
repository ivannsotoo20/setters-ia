/**
 * Tracked calendar URL helper (Hito 10).
 *
 * Carga el calendar_accounts default activo del tenant + lead data, y construye
 * la URL trackable con tracking_uuid + phone prefilled.
 *
 * Lazy generation: si `leads.tracking_uuid` es NULL, lo computa con HMAC y UPDATE.
 *
 * Llamado por el caller del pipeline (motor) ANTES de runPipeline. El resultado
 * se pasa a `composePrompt.options.trackedCalendarUrl` para que el placeholder
 * `{{tracked_calendar_url|fallback}}` de fase_6_v4 quede resuelto.
 *
 * Si NO hay calendar default vinculado → devuelve null y composer cae al
 * closingResourceUrl legacy de trainer_preferences.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTrackedBookingUrl } from '../lib/booking-url-builder.js';
import { computeTrackingUuid } from '../lib/tracking-uuid.js';
import { logger } from '../lib/logger.js';

export interface GetTrackedCalendarUrlInput {
  supabase: SupabaseClient;
  tenantId: number;
  leadId: number;
}

export async function getTrackedCalendarUrl(
  input: GetTrackedCalendarUrlInput,
): Promise<string | null> {
  const { supabase, tenantId, leadId } = input;

  // 1. Carga calendar default activo
  const { data: cal, error: calErr } = await supabase
    .from('calendar_accounts')
    .select('id, widget_base_url')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (calErr) {
    logger.warn({ err: calErr.message, tenantId }, 'getTrackedCalendarUrl: calendar_accounts query failed');
    return null;
  }
  if (!cal) {
    return null;
  }

  // 2. Carga lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, first_name, tracking_uuid')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (leadErr || !lead) {
    logger.warn({ err: leadErr?.message, tenantId, leadId }, 'getTrackedCalendarUrl: lead query failed');
    return null;
  }

  // 3. Lazy generation tracking_uuid (idempotente)
  let trackingUuid = lead.tracking_uuid;
  if (!trackingUuid) {
    trackingUuid = computeTrackingUuid(lead.id);
    const { error: updErr } = await supabase
      .from('leads')
      .update({ tracking_uuid: trackingUuid })
      .eq('id', lead.id)
      .is('tracking_uuid', null);
    if (updErr) {
      // Otro proceso lo pudo generar concurrente — releemos.
      const { data: relead } = await supabase
        .from('leads')
        .select('tracking_uuid')
        .eq('id', lead.id)
        .maybeSingle();
      trackingUuid = relead?.tracking_uuid ?? trackingUuid;
    }
  }

  // 4. Build URL
  return buildTrackedBookingUrl({
    calendar: { widget_base_url: cal.widget_base_url },
    lead: {
      id: lead.id,
      phone: lead.phone,
      first_name: lead.first_name,
    },
    trackingUuid,
  });
}
