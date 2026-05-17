/**
 * GhlClient — fachada del cliente GHL v2 para el motor.
 *
 * Construir con `new GhlClient({ locationId, apiToken })` y usar los métodos
 * `upsertContact`, `registerInbound`, `registerOutbound`, `createOpportunity`,
 * `moveStage`, `listPipelines`. El cliente NO mantiene caché de pipeline;
 * eso es responsabilidad del caller (motor lee `connection_config` del
 * `integration_accounts.connection_config`).
 *
 * Patrón: cada método delega al módulo correspondiente. El cliente sirve para
 * (a) tipar de un golpe lo expuesto a callers, (b) inyectar `fetchImpl` para tests.
 */

import {
  createAppointment,
  ensureCustomField,
  flattenFreeSlots,
  getAppointment,
  getCalendar,
  getFreeSlots,
  listAppointmentsByCalendar,
  listCalendars,
  listLocationCustomFields,
  type GetFreeSlotsOptions,
} from './calendars.js';
import { getContactInfo, upsertContact, updateContactCustomFields } from './contacts.js';
import {
  registerInboundMessage,
  registerOutboundMessage,
  sendMessageViaChannel,
  type GhlSendMessageInput,
} from './messages.js';
import {
  createOpportunity,
  listPipelines,
  moveOpportunityStage,
} from './opportunities.js';
import type {
  GhlContact,
  GhlContactUpsertInput,
  GhlContactUpsertResult,
  GhlCreateOpportunityInput,
  GhlCredentials,
  GhlCustomField,
  GhlMoveOpportunityInput,
  GhlOpportunity,
  GhlPipeline,
  GhlRegisterMessageInput,
  GhlRegisterMessageResult,
} from './types.js';
import type {
  GhlAppointment,
  GhlAppointmentWebhookEvent,
  GhlCalendar,
  GhlCreateAppointmentInput,
  GhlFreeSlot,
  GhlFreeSlotsResponse,
  GhlLocationCustomField,
} from './types-calendar.js';

export type {
  GhlConnectionConfig,
  GhlContact,
  GhlContactUpsertInput,
  GhlContactUpsertResult,
  GhlCreateOpportunityInput,
  GhlCredentials,
  GhlCustomField,
  GhlMessageDirection,
  GhlMessageType,
  GhlMoveOpportunityInput,
  GhlOpportunity,
  GhlPipeline,
  GhlPipelineStage,
  GhlRegisterMessageInput,
  GhlRegisterMessageResult,
  GhlStageMap,
} from './types.js';
export { GhlApiError } from './api-client.js';
export { AI_ZWSP_TAG, appendZwspIfMissing, sendMessageViaChannel } from './messages.js';
export type { GhlSendMessageInput } from './messages.js';
export {
  createAppointment,
  ensureCustomField,
  flattenFreeSlots,
  getAppointment,
  getCalendar,
  getFreeSlots,
  GhlSlotConflictError,
  listAppointmentsByCalendar,
  listCalendars,
  listLocationCustomFields,
  createLocationCustomField,
} from './calendars.js';
export type { GetFreeSlotsOptions } from './calendars.js';
export type {
  GhlAppointment,
  GhlAppointmentWebhookEvent,
  GhlCalendar,
  GhlCreateAppointmentInput,
  GhlFreeSlot,
  GhlFreeSlotsResponse,
  GhlLocationCustomField,
} from './types-calendar.js';
export { FYZON_LEAD_UUID_FIELD_KEY } from './types-calendar.js';

export interface GhlClientOptions extends GhlCredentials {
  /** Override fetch (para tests). */
  fetchImpl?: typeof fetch;
}

export class GhlClient {
  private readonly locationId: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GhlClientOptions) {
    if (!opts.locationId) throw new Error('GhlClient: locationId requerido');
    if (!opts.apiToken) throw new Error('GhlClient: apiToken requerido');
    this.locationId = opts.locationId;
    this.apiToken = opts.apiToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  upsertContact(
    input: Omit<GhlContactUpsertInput, 'locationId'> & { locationId?: string },
  ): Promise<GhlContactUpsertResult> {
    return upsertContact(
      this.apiToken,
      { ...input, locationId: input.locationId ?? this.locationId },
      this.fetchImpl,
    );
  }

  getContactInfo(contactId: string): Promise<GhlContact | null> {
    return getContactInfo(this.apiToken, contactId, this.fetchImpl);
  }

  updateContactCustomFields(
    contactId: string,
    customFields: GhlCustomField[],
  ): Promise<GhlContact> {
    return updateContactCustomFields(this.apiToken, contactId, customFields, this.fetchImpl);
  }

  registerInbound(input: GhlRegisterMessageInput): Promise<GhlRegisterMessageResult> {
    return registerInboundMessage(this.apiToken, input, this.fetchImpl);
  }

  registerOutbound(input: GhlRegisterMessageInput): Promise<GhlRegisterMessageResult> {
    return registerOutboundMessage(this.apiToken, input, this.fetchImpl);
  }

  sendMessageViaChannel(input: GhlSendMessageInput): Promise<GhlRegisterMessageResult> {
    return sendMessageViaChannel(this.apiToken, input, this.fetchImpl);
  }

  listPipelines(): Promise<GhlPipeline[]> {
    return listPipelines(this.apiToken, this.locationId, this.fetchImpl);
  }

  createOpportunity(
    input: Omit<GhlCreateOpportunityInput, 'locationId'> & { locationId?: string },
  ): Promise<GhlOpportunity> {
    return createOpportunity(
      this.apiToken,
      { ...input, locationId: input.locationId ?? this.locationId },
      this.fetchImpl,
    );
  }

  moveOpportunityStage(input: GhlMoveOpportunityInput): Promise<GhlOpportunity> {
    return moveOpportunityStage(this.apiToken, input, this.fetchImpl);
  }

  // ----- Calendars (Hito 10) -----

  listCalendars(): Promise<GhlCalendar[]> {
    return listCalendars(this.apiToken, this.locationId, this.fetchImpl);
  }

  getCalendar(calendarId: string): Promise<GhlCalendar | null> {
    return getCalendar(this.apiToken, calendarId, this.fetchImpl);
  }

  getAppointment(appointmentId: string): Promise<GhlAppointment | null> {
    return getAppointment(this.apiToken, appointmentId, this.fetchImpl);
  }

  listAppointmentsByCalendar(
    calendarId: string,
    startTime: string,
    endTime: string,
  ): Promise<GhlAppointment[]> {
    return listAppointmentsByCalendar(
      this.apiToken,
      this.locationId,
      calendarId,
      startTime,
      endTime,
      this.fetchImpl,
    );
  }

  listLocationCustomFields(): Promise<GhlLocationCustomField[]> {
    return listLocationCustomFields(this.apiToken, this.locationId, this.fetchImpl);
  }

  ensureCustomField(opts?: {
    fieldKey?: string;
    name?: string;
    dataType?: 'TEXT' | 'LARGE_TEXT' | 'NUMERICAL' | 'PHONE' | 'EMAIL' | 'DATE';
    model?: 'contact' | 'opportunity';
  }): Promise<GhlLocationCustomField> {
    return ensureCustomField(this.apiToken, this.locationId, opts, this.fetchImpl);
  }

  // ----- API Booking (Hito 10.6) -----

  /**
   * Consulta huecos libres de un calendar. Devuelve response raw GHL; usar
   * `flattenFreeSlots` para aplanar a array cronológico.
   */
  getFreeSlots(calendarId: string, opts?: GetFreeSlotsOptions): Promise<GhlFreeSlotsResponse> {
    return getFreeSlots(this.apiToken, calendarId, opts, this.fetchImpl);
  }

  /**
   * Carga + aplana en un solo paso. Devuelve los primeros `maxSlots` slots
   * ordenados cronológicamente (default 8 si no se pasa).
   */
  async getFreeSlotsFlat(
    calendarId: string,
    opts?: GetFreeSlotsOptions & { maxSlots?: number },
  ): Promise<GhlFreeSlot[]> {
    const response = await getFreeSlots(this.apiToken, calendarId, opts, this.fetchImpl);
    return flattenFreeSlots(response, opts?.maxSlots ?? 8);
  }

  /**
   * Crea una cita asociada a un contacto GHL existente.
   * Lanza `GhlSlotConflictError` si el slot ya no está disponible (409/422).
   */
  createAppointment(
    input: Omit<GhlCreateAppointmentInput, 'locationId'> & { locationId?: string },
  ): Promise<GhlAppointment> {
    return createAppointment(
      this.apiToken,
      { ...input, locationId: input.locationId ?? this.locationId },
      this.fetchImpl,
    );
  }
}
