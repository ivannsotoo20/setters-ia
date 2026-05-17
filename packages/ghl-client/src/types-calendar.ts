/**
 * Tipos de Calendar/Appointments de GHL v2 (Hito 10 + 10.6).
 *
 * GHL API v2 endpoints relevantes:
 *  - GET  /calendars/?locationId=...
 *  - GET  /calendars/{id}
 *  - GET  /calendars/{id}/free-slots                  (Hito 10.6)
 *  - GET  /calendars/events
 *  - GET  /calendars/events/appointments/{id}
 *  - POST /calendars/events/appointments              (Hito 10.6)
 *  - GET  /locations/{locationId}/customFields
 *  - POST /locations/{locationId}/customFields
 */

export interface GhlCalendar {
  id: string;
  locationId: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  widgetSlug?: string | null;
  calendarType?: string;
  isActive?: boolean;
  slotDuration?: number;
  slotInterval?: number;
  slotBuffer?: number;
  preBuffer?: number;
  appoinmentPerSlot?: number;
  appoinmentPerDay?: number | null;
}

export interface GhlAppointment {
  id: string;
  locationId?: string;
  calendarId: string;
  contactId: string;
  groupId?: string | null;
  appointmentStatus: 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'invalid';
  assignedUserId?: string | null;
  users?: string[];
  notes?: string | null;
  title?: string | null;
  startTime: string;
  endTime: string;
  source?: string | null;
  address?: string | null;
  dateAdded?: string;
  dateUpdated?: string;
  customFields?: Array<{ id: string; key?: string; value: string }>;
}

export interface GhlLocationCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: 'TEXT' | 'LARGE_TEXT' | 'NUMERICAL' | 'PHONE' | 'EMAIL' | 'DATE' | 'CHECKBOX' | 'SINGLE_OPTIONS' | 'MULTIPLE_OPTIONS' | string;
  model: 'contact' | 'opportunity' | string;
  isAllowedCustomOption?: boolean;
  position?: number;
}

export interface GhlAppointmentWebhookEvent {
  type: 'AppointmentCreate' | 'AppointmentUpdate' | 'AppointmentDelete';
  locationId: string;
  appointment: GhlAppointment;
}

export const FYZON_LEAD_UUID_FIELD_KEY = 'fyzon_lead_uuid';

/**
 * Respuesta cruda de GHL `GET /calendars/{id}/free-slots`.
 *
 * Formato GHL v2:
 *   {
 *     "2026-05-19": { "slots": ["2026-05-19T15:00:00+02:00", ...] },
 *     "2026-05-20": { "slots": [...] },
 *     "traceId": "..."          // opcional, GHL lo añade en algunos responses
 *   }
 *
 * Cada key es una fecha local en formato YYYY-MM-DD (en la timezone solicitada).
 * Los slots son ISO 8601 con offset de timezone (NO UTC pura).
 *
 * Usamos Record<string, unknown> + helper `flattenFreeSlots` para extraer
 * solo las keys de fecha y descartar metadata (traceId, etc.).
 */
export type GhlFreeSlotsResponse = Record<string, { slots: string[] } | unknown>;

/** Slot aplanado con metadata útil para renderizado. Resultado de `flattenFreeSlots`. */
export interface GhlFreeSlot {
  /** ISO 8601 completo con offset de timezone (ej: `2026-05-19T15:00:00+02:00`). */
  iso: string;
  /** Fecha local YYYY-MM-DD (la key del response). */
  date: string;
  /** Hora local HH:MM (parseado del ISO). */
  time: string;
}

/** Input para `POST /calendars/events/appointments`. */
export interface GhlCreateAppointmentInput {
  /** ID del calendar GHL donde se crea la cita. */
  calendarId: string;
  /** Location ID GHL (sub-cuenta del trainer). */
  locationId: string;
  /** Contact ID GHL al que se asocia la cita (clave de trazabilidad). */
  contactId: string;
  /** ISO 8601 con timezone. */
  startTime: string;
  /** ISO 8601 con timezone. Opcional — si no, GHL calcula con la duración del slot del calendar. */
  endTime?: string;
  /** Título de la cita (visible para el trainer en GHL). Si no, usa el default del calendar. */
  title?: string;
  /** Estado inicial. Default GHL: 'confirmed'. */
  appointmentStatus?: 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'invalid';
  /** Usuario GHL asignado (host de la reunión). Si no, GHL elige según reglas del calendar. */
  assignedUserId?: string;
  /** Dirección o link de la reunión. Para calendars de tipo videollamada, GHL lo genera. */
  address?: string;
  /** Si true, ignora validaciones de slot (puede agendar fuera de horario). Default false. */
  ignoreDateRange?: boolean;
  /** Si true, GHL envía notificación email al contacto. Default depende del calendar. */
  toNotify?: boolean;
}
