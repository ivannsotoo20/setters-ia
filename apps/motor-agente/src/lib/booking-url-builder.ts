/**
 * Booking URL builder (Hito 10).
 *
 * Toma un calendar GHL vinculado + un lead y produce la URL trackable que
 * recibe el lead en el mensaje del setter en F6.
 *
 * Mecanismo híbrido:
 *  - `?fyzon_lead_uuid=<slug>` → custom field GHL `fyzon_lead_uuid` queda con ese valor cuando el lead reserva. Match con `confidence=100`.
 *  - `?phone=<E.164>` + `?prefill=true` → GHL pre-rellena el form con el phone normalizado. Fallback de match con `confidence=80`.
 *  - `?firstName=<x>` → cosmético, mejora UX.
 *
 * La URL base viene de `calendar_accounts.widget_base_url`.
 */

import { computeTrackingUuid } from './tracking-uuid.js';

export interface BookingUrlInput {
  calendar: {
    widget_base_url: string;
  };
  lead: {
    id: number | string;
    phone?: string | null;
    first_name?: string | null;
  };
  /** Override del slug (si ya está computado y se quiere ahorrar el HMAC). */
  trackingUuid?: string;
}

export function buildTrackedBookingUrl(input: BookingUrlInput): string {
  if (!input.calendar?.widget_base_url) {
    throw new Error('buildTrackedBookingUrl: calendar.widget_base_url requerido');
  }
  if (input.lead?.id === undefined || input.lead?.id === null) {
    throw new Error('buildTrackedBookingUrl: lead.id requerido');
  }

  const url = new URL(input.calendar.widget_base_url);

  const slug = input.trackingUuid ?? computeTrackingUuid(input.lead.id);
  url.searchParams.set('fyzon_lead_uuid', slug);

  const phone = input.lead.phone?.trim();
  if (phone) {
    url.searchParams.set('phone', phone);
    url.searchParams.set('prefill', 'true');
  }

  const firstName = input.lead.first_name?.trim();
  if (firstName) {
    url.searchParams.set('firstName', firstName);
  }

  return url.toString();
}
