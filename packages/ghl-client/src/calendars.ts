/**
 * GHL Calendar API v2 client (Hito 10 + 10.6).
 *
 * Endpoints cubiertos:
 *   - GET  /calendars/?locationId=...
 *   - GET  /calendars/{id}
 *   - GET  /calendars/{id}/free-slots                  (Hito 10.6)
 *   - GET  /calendars/events
 *   - GET  /calendars/events/appointments/{id}
 *   - POST /calendars/events/appointments              (Hito 10.6)
 *   - GET  /locations/{locationId}/customFields
 *   - POST /locations/{locationId}/customFields
 *
 * Patrón: funciones puras `(apiToken, input, fetchImpl)` que delegan en `ghlRequest`.
 * El cliente GhlClient (index.ts) las expone como métodos.
 */

import { GhlApiError, ghlRequest } from './api-client.js';
import type {
  GhlAppointment,
  GhlCalendar,
  GhlCreateAppointmentInput,
  GhlFreeSlot,
  GhlFreeSlotsResponse,
  GhlLocationCustomField,
} from './types-calendar.js';
import { FYZON_LEAD_UUID_FIELD_KEY } from './types-calendar.js';

/**
 * Lanzado cuando GHL rechaza un `createAppointment` por conflicto de slot
 * (otro lead ya reservó esa hora, o el slot quedó fuera de horario).
 * El caller debe re-proponer al lead un slot distinto.
 */
export class GhlSlotConflictError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'GhlSlotConflictError';
    this.status = status;
    this.body = body;
  }
}

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

// =============================================================================
// Hito 10.6 — API Booking: slots libres + creación de citas
// =============================================================================

export interface GetFreeSlotsOptions {
  /** Fecha de inicio del rango. Default: ahora. GHL espera Unix milliseconds. */
  startDate?: Date | number;
  /** Fecha fin del rango. Default: ahora + 14 días. */
  endDate?: Date | number;
  /** IANA timezone (ej: 'Europe/Madrid'). Default: lo que tenga el calendar. */
  timezone?: string;
  /** Si el calendar es de tipo team, filtra slots de un usuario específico. */
  userId?: string;
}

/**
 * Consulta los huecos libres de un calendar GHL en un rango temporal.
 *
 * Endpoint: GET /calendars/{calendarId}/free-slots?startDate={ms}&endDate={ms}&timezone={tz}&userId={id?}
 *
 * Response GHL:
 *   {
 *     "2026-05-19": { "slots": ["2026-05-19T15:00:00+02:00", ...] },
 *     "2026-05-20": { "slots": [...] },
 *     "traceId": "..."   // metadata, no es fecha
 *   }
 *
 * Devuelve el response raw. Para aplanar a Array<GhlFreeSlot>, usar `flattenFreeSlots`.
 */
export async function getFreeSlots(
  apiToken: string,
  calendarId: string,
  opts: GetFreeSlotsOptions = {},
  fetchImpl?: typeof fetch,
): Promise<GhlFreeSlotsResponse> {
  if (!calendarId) throw new Error('getFreeSlots: calendarId requerido');

  const now = Date.now();
  const startMs = toUnixMs(opts.startDate ?? now);
  const endMs = toUnixMs(opts.endDate ?? now + 14 * 24 * 60 * 60 * 1000);
  if (startMs >= endMs) throw new Error('getFreeSlots: startDate debe ser anterior a endDate');

  const query: Record<string, string | number | undefined> = {
    startDate: startMs,
    endDate: endMs,
  };
  if (opts.timezone) query.timezone = opts.timezone;
  if (opts.userId) query.userId = opts.userId;

  const response = await ghlRequest<GhlFreeSlotsResponse>({
    apiToken,
    method: 'GET',
    path: `/calendars/${encodeURIComponent(calendarId)}/free-slots`,
    query,
    fetchImpl,
  });

  return response;
}

/**
 * Aplana un `GhlFreeSlotsResponse` a un array cronológico de `GhlFreeSlot`.
 * Descarta keys que no son fechas (ej: `traceId`, otra metadata GHL).
 *
 * @param response — el response raw de `getFreeSlots`.
 * @param maxSlots — si se pasa, recorta el resultado a los primeros N slots (en orden cronológico).
 */
export function flattenFreeSlots(
  response: GhlFreeSlotsResponse,
  maxSlots?: number,
): GhlFreeSlot[] {
  const result: GhlFreeSlot[] = [];
  const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

  for (const [key, value] of Object.entries(response)) {
    if (!dateKeyRegex.test(key)) continue;
    if (!value || typeof value !== 'object') continue;
    const slotsContainer = value as { slots?: unknown };
    if (!Array.isArray(slotsContainer.slots)) continue;

    for (const iso of slotsContainer.slots) {
      if (typeof iso !== 'string' || iso.trim() === '') continue;
      const time = extractLocalTime(iso);
      result.push({ iso, date: key, time });
    }
  }

  result.sort((a, b) => a.iso.localeCompare(b.iso));

  if (maxSlots != null && maxSlots > 0 && result.length > maxSlots) {
    return result.slice(0, maxSlots);
  }
  return result;
}

/** Extrae HH:MM del ISO 8601 con offset (`2026-05-19T15:00:00+02:00` → `15:00`). */
function extractLocalTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return '';
  return `${match[1]}:${match[2]}`;
}

function toUnixMs(input: Date | number): number {
  if (typeof input === 'number') return input;
  return input.getTime();
}

/**
 * Crea una cita en GHL asociada a un contacto existente.
 *
 * Endpoint: POST /calendars/events/appointments
 *
 * Clave para la trazabilidad: pasamos el `contactId` real del lead del bot
 * (`conversations.ghl_contact_id`). Así la cita queda asociada al contacto IG/WA/FB
 * correcto desde el primer momento, sin que GHL cree un contacto duplicado.
 *
 * Si GHL devuelve 409 (slot conflict), lanza `GhlSlotConflictError` para que el
 * caller re-proponga al lead.
 */
export async function createAppointment(
  apiToken: string,
  input: GhlCreateAppointmentInput,
  fetchImpl?: typeof fetch,
): Promise<GhlAppointment> {
  if (!input.calendarId) throw new Error('createAppointment: calendarId requerido');
  if (!input.locationId) throw new Error('createAppointment: locationId requerido');
  if (!input.contactId) throw new Error('createAppointment: contactId requerido');
  if (!input.startTime) throw new Error('createAppointment: startTime requerido');

  const body: Record<string, unknown> = {
    calendarId: input.calendarId,
    locationId: input.locationId,
    contactId: input.contactId,
    startTime: input.startTime,
  };
  if (input.endTime) body.endTime = input.endTime;
  if (input.title) body.title = input.title;
  if (input.appointmentStatus) body.appointmentStatus = input.appointmentStatus;
  if (input.assignedUserId) body.assignedUserId = input.assignedUserId;
  if (input.address) body.address = input.address;
  if (input.ignoreDateRange != null) body.ignoreDateRange = input.ignoreDateRange;
  if (input.toNotify != null) body.toNotify = input.toNotify;

  try {
    const response = await ghlRequest<{ appointment?: GhlAppointment } | GhlAppointment>({
      apiToken,
      method: 'POST',
      path: '/calendars/events/appointments',
      body,
      fetchImpl,
    });

    // GHL inconsistente: a veces { appointment }, a veces el objeto directo.
    if (response && typeof response === 'object') {
      if ('appointment' in response && response.appointment) return response.appointment;
      if ('id' in response && (response as GhlAppointment).id) return response as GhlAppointment;
    }
    throw new Error('createAppointment: respuesta GHL sin appointment');
  } catch (err) {
    if (err instanceof GhlApiError && (err.status === 409 || err.status === 422)) {
      // 409 conflict, 422 unprocessable (slot fuera de horario / ya reservado).
      throw new GhlSlotConflictError(
        `Slot no disponible (HTTP ${err.status}): ${err.message}`,
        err.status,
        err.body,
      );
    }
    throw err;
  }
}
