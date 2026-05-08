/**
 * Tipos del cliente GHL (LeadConnector v2).
 *
 * GHL API v2 base URL: https://services.leadconnectorhq.com
 * Auth: Bearer <api_token> + Version: 2021-07-28 + Accept: application/json
 *
 * El api_token de sub-cuenta se genera en panel GHL → Settings → API Keys.
 * Es propio de la `locationId` (sub-cuenta del trainer).
 */

export interface GhlCredentials {
  /** ID de la sub-cuenta GHL del trainer. */
  locationId: string;
  /** API token de sub-cuenta (Bearer). */
  apiToken: string;
}

/** Custom field en formato GHL — id del field + value libre. */
export interface GhlCustomField {
  id: string;
  value: string;
}

/** Contacto GHL. Solo modelamos los campos que el motor lee/escribe. */
export interface GhlContact {
  id: string;
  locationId?: string;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  source?: string | null;
  customFields?: GhlCustomField[];
}

/** Argumentos para upsertContact (compatible con POST /contacts/upsert). */
export interface GhlContactUpsertInput {
  locationId: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  /** Custom fields a fijar; merge con los ya existentes. */
  customFields?: GhlCustomField[];
  /** Tags a añadir (opcional). */
  tags?: string[];
}

export interface GhlContactUpsertResult {
  contact: GhlContact;
  /** true si fue creado nuevo, false si actualizado. */
  isNew: boolean;
}

/**
 * Tipos de mensaje que GHL acepta.
 *
 * - 'WhatsApp' / 'SMS' / 'Email': canales nativos GHL.
 * - 'Custom': mensaje cuyo envío gestiona un provider externo (nuestro caso con
 *   YCloud/ManyChat). GHL lo registra en la conversación pero NO dispara envío.
 */
export type GhlMessageType = 'WhatsApp' | 'SMS' | 'Email' | 'Custom';

/** Direction de un mensaje en una conversación GHL. */
export type GhlMessageDirection = 'inbound' | 'outbound';

/** Argumentos para registrar un mensaje (inbound o outbound externo). */
export interface GhlRegisterMessageInput {
  type: GhlMessageType;
  contactId: string;
  message: string;
  /** ISO 8601 (defecto: ahora server-side). */
  date?: string;
  /** Para custom providers, id del provider configurado en GHL. */
  conversationProviderId?: string;
  /** Adjuntos (URLs públicas). */
  attachments?: string[];
}

export interface GhlRegisterMessageResult {
  /** ID que GHL asigna al mensaje. */
  messageId: string;
  /** ID de la conversación (existente o creada). */
  conversationId: string;
}

export interface GhlPipelineStage {
  id: string;
  name: string;
  position?: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  locationId: string;
  stages: GhlPipelineStage[];
}

export interface GhlOpportunity {
  id: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  name: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  monetaryValue?: number;
}

export interface GhlCreateOpportunityInput {
  locationId: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  name: string;
  status?: 'open' | 'won' | 'lost' | 'abandoned';
  monetaryValue?: number;
}

export interface GhlMoveOpportunityInput {
  opportunityId: string;
  pipelineId?: string;
  pipelineStageId: string;
  /** Para reabrir/ganar/perder al mover, si aplica. */
  status?: 'open' | 'won' | 'lost' | 'abandoned';
}

/** Mapping fase Setter → stageId GHL (lo que vive en connection_config). */
export type GhlStageMap = Partial<Record<'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F11' | 'F12', string>>;

/** Configuración derivada de connection_config para un tenant con GHL. */
export interface GhlConnectionConfig {
  pipelineId: string;
  stageMap: GhlStageMap;
  /** ID del custom provider GHL para mensajes externos (opcional). */
  conversationProviderId?: string;
  /** IDs de custom fields para metadatos del lead (opcional). */
  customFieldIds?: {
    externalId?: string;
    username?: string;
    conversationContext?: string;
    leadGoal?: string;
    primaryProblem?: string;
  };
}
