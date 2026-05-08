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
}
