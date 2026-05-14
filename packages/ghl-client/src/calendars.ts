/**
 * GHL Calendar API v2 client (Hito 10).
 *
 * Endpoints cubiertos:
 *   - GET  /calendars/?locationId=...
 *   - GET  /calendars/{id}
 *   - GET  /calendars/events/appointments/{id}
 *   - GET  /locations/{locationId}/customFields
 *   - POST /locations/{locationId}/customFields
 *
 * Patrón: funciones puras `(apiToken, input, fetchImpl)` que delegan en `ghlRequest`.
 * El cliente GhlClient (index.ts) las expone como métodos.
 */

import { ghlRequest } from './api-client.js';
import type {
  GhlAppointment,
  GhlCalendar,
  GhlLocationCustomField,
} from './types-calendar.js';
import { FYZON_LEAD_UUID_FIELD_KEY } from './types-calendar.js';

/** Lista los calendarios de una location GHL. */
export async function listCalendars(
  apiToken: string,
  locationId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlCalendar[]> {
  if (!locationId) throw new Error('listCalendars: locationId requerido');

  const response = await ghlRequest<{ calendars?: GhlCalendar[] }>({
    apiToken,
    method: 'GET',
    path: '/calendars/',
    query: { locationId },
    fetchImpl,
  });

  return response.calendars ?? [];
}

/** Carga un calendario por ID. */
export async function getCalendar(
  apiToken: string,
  calendarId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlCalendar | null> {
  if (!calendarId) throw new Error('getCalendar: calendarId requerido');

  const response = await ghlRequest<{ calendar?: GhlCalendar }>({
    apiToken,
    method: 'GET',
    path: `/calendars/${encodeURIComponent(calendarId)}`,
    fetchImpl,
  });

  return response.calendar ?? null;
}

/**
 * Lista citas de un calendario en un rango temporal.
 * Endpoint: GET /calendars/events?locationId=...&calendarId=...&startTime=ISO&endTime=ISO
 */
export async function listAppointmentsByCalendar(
  apiToken: string,
  locationId: string,
  calendarId: string,
  startTime: string,
  endTime: string,
  fetchImpl?: typeof fetch,
): Promise<GhlAppointment[]> {
  if (!locationId) throw new Error('listAppointmentsByCalendar: locationId requerido');
  if (!calendarId) throw new Error('listAppointmentsByCalendar: calendarId requerido');
  if (!startTime || !endTime) throw new Error('listAppointmentsByCalendar: startTime y endTime requeridos');

  // GHL v2 espera Unix milliseconds (number) en startTime/endTime, no ISO.
  const startMs = isoOrMsToUnixMs(startTime);
  const endMs = isoOrMsToUnixMs(endTime);

  const response = await ghlRequest<{ events?: GhlAppointment[] }>({
    apiToken,
    method: 'GET',
    path: '/calendars/events',
    query: { locationId, calendarId, startTime: startMs, endTime: endMs },
    fetchImpl,
  });

  return response.events ?? [];
}

function isoOrMsToUnixMs(input: string): number {
  // Si ya es un número (ms en string), devolverlo como número.
  if (/^\d+$/.test(input)) return Number(input);
  // ISO → Date.parse devuelve ms.
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) throw new Error(`listAppointmentsByCalendar: invalid date "${input}"`);
  return ms;
}

/** Carga un appointment por ID (para refrescar datos completos si el payload del webhook llega incompleto). */
export async function getAppointment(
  apiToken: string,
  appointmentId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlAppointment | null> {
  if (!appointmentId) throw new Error('getAppointment: appointmentId requerido');

  const response = await ghlRequest<{ appointment?: GhlAppointment } | GhlAppointment>({
    apiToken,
    method: 'GET',
    path: `/calendars/events/appointments/${encodeURIComponent(appointmentId)}`,
    fetchImpl,
  });

  // GHL inconsistente: a veces devuelve { appointment }, a veces el objeto directo.
  if (response && typeof response === 'object') {
    if ('appointment' in response && response.appointment) return response.appointment;
    if ('id' in response && (response as GhlAppointment).id) return response as GhlAppointment;
  }
  return null;
}

/** Lista los custom fields configurados en una location (contact/opportunity). */
export async function listLocationCustomFields(
  apiToken: string,
  locationId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlLocationCustomField[]> {
  if (!locationId) throw new Error('listLocationCustomFields: locationId requerido');

  const response = await ghlRequest<{ customFields?: GhlLocationCustomField[] }>({
    apiToken,
    method: 'GET',
    path: `/locations/${encodeURIComponent(locationId)}/customFields`,
    fetchImpl,
  });

  return response.customFields ?? [];
}

/** Crea un custom field en una location. Body shape GHL v2 con model=contact. */
export async function createLocationCustomField(
  apiToken: string,
  locationId: string,
  input: {
    name: string;
    fieldKey?: string;
    dataType: 'TEXT' | 'LARGE_TEXT' | 'NUMERICAL' | 'PHONE' | 'EMAIL' | 'DATE';
    model?: 'contact' | 'opportunity';
  },
  fetchImpl?: typeof fetch,
): Promise<GhlLocationCustomField> {
  if (!locationId) throw new Error('createLocationCustomField: locationId requerido');
  if (!input.name) throw new Error('createLocationCustomField: name requerido');

  const body: Record<string, unknown> = {
    name: input.name,
    dataType: input.dataType,
    model: input.model ?? 'contact',
  };
  if (input.fieldKey) body.fieldKey = input.fieldKey;

  const response = await ghlRequest<{ customField?: GhlLocationCustomField }>({
    apiToken,
    method: 'POST',
    path: `/locations/${encodeURIComponent(locationId)}/customFields`,
    body,
    fetchImpl,
  });

  if (!response.customField || !response.customField.id) {
    throw new Error('createLocationCustomField: respuesta GHL sin customField.id');
  }
  return response.customField;
}

/**
 * Garantiza que existe un custom field con la key dada en una location GHL.
 * Idempotente: si existe, devuelve el existente. Si no, lo crea.
 *
 * Default: key='fyzon_lead_uuid' (TEXT, contact) — usado por el matcher Hito 10
 * para identificar al lead que reservó.
 */
export async function ensureCustomField(
  apiToken: string,
  locationId: string,
  opts: {
    fieldKey?: string;
    name?: string;
    dataType?: 'TEXT' | 'LARGE_TEXT' | 'NUMERICAL' | 'PHONE' | 'EMAIL' | 'DATE';
    model?: 'contact' | 'opportunity';
  } = {},
  fetchImpl?: typeof fetch,
): Promise<GhlLocationCustomField> {
  const fieldKey = opts.fieldKey ?? FYZON_LEAD_UUID_FIELD_KEY;
  const name = opts.name ?? 'Fyzon Lead UUID';
  const dataType = opts.dataType ?? 'TEXT';
  const model = opts.model ?? 'contact';

  const existing = await listLocationCustomFields(apiToken, locationId, fetchImpl);

  // GHL guarda fieldKey con prefijo "contact." o "opportunity." según model.
  const target = `${model}.${fieldKey}`;
  const found = existing.find(
    (f) => f.fieldKey === target || f.fieldKey === fieldKey,
  );
  if (found) return found;

  return createLocationCustomField(apiToken, locationId, { name, fieldKey, dataType, model }, fetchImpl);
}
