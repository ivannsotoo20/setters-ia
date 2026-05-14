/**
 * Tipos de Calendar/Appointments de GHL v2 (Hito 10).
 *
 * GHL API v2 endpoints relevantes:
 *  - GET  /calendars/?locationId=...
 *  - GET  /calendars/{id}
 *  - GET  /calendars/events/appointments/{id}
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
