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
 * Hardening 2026-05-15 (audit security HIGH H-8): `phone` y `firstName` son PII.
 * Si van en query string, leak en logs de proxy GHL, historial browser del
 * lead, referer headers, analytics third-party. Por defecto (modo `minimal`)
 * NO los incluimos. El matching sigue funcionando vía `fyzon_lead_uuid`
 * (confidence=100). El lead debe escribir su phone manualmente en el widget.
 *
 * Para habilitar prefill PII opt-in (trainer acepta riesgo GDPR), setear
 * env `BOOKING_URL_PREFILL_PII=true` y documentar al trainer.
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
  /**
   * Opt-in para incluir phone/firstName en query params. Default false (PII
   * fuera de la URL). Si true, EL CALLER debe documentar al trainer el riesgo
   * GDPR (logs proxy + historial browser).
   */
  prefillPii?: boolean;
}

export function buildTrackedBookingUrl(input: BookingUrlInput): string {
  if (!input.calendar?.widget_base_url) {
    throw new Error('buildTrackedBookingUrl: calendar.widget_base_url requerido');
  }
  if (input.lead?.id === undefined || input.lead?.id === null) {
    throw new Error('buildTrackedBookingUrl: lead.id requerido');
  }

  const url = new URL(input.calendar.widget_base_url);

  // Validación de protocol: solo HTTPS. http: queda permitido en localhost dev.
  if (url.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
    throw new Error(`buildTrackedBookingUrl: widget_base_url debe ser https (got ${url.protocol})`);
  }

  const slug = input.trackingUuid ?? computeTrackingUuid(input.lead.id);
  url.searchParams.set('fyzon_lead_uuid', slug);

  // Opt-in PII prefill (default false = ningún PII en query).
  const prefillPii =
    input.prefillPii ?? process.env.BOOKING_URL_PREFILL_PII === 'true';

  if (prefillPii) {
    const phone = input.lead.phone?.trim();
    if (phone) {
      url.searchParams.set('phone', phone);
      url.searchParams.set('prefill', 'true');
    }
    const firstName = input.lead.first_name?.trim();
    if (firstName) {
      url.searchParams.set('firstName', firstName);
    }
  }

  return url.toString();
}
