/**
 * Tipos del payload GHL webhook (subset usado por el motor Fyzon).
 *
 * GHL dispara webhooks vía sus Workflows configurados en panel:
 *   - InboundMessage: lead manda IG/FB/Email/SMS/WhatsApp a la sub-cuenta.
 *   - OutboundMessage: alguien envía un mensaje al lead — IA, humano, automation.
 *
 * El motor distingue mensajes IA propios de mensajes humanos por presencia
 * del caracter ZERO WIDTH SPACE (​). IA siempre apendea ZWSP. Humano nunca.
 */

export type GhlWebhookType = 'InboundMessage' | 'OutboundMessage';

/**
 * Tipos de mensaje en webhooks GHL. Coincide con el campo `messageType` que GHL
 * envía. Cubre IG/FB Messenger/SMS/WhatsApp/Email.
 */
export type GhlWebhookMessageType =
  | 'IG'
  | 'FB Messenger'
  | 'WhatsApp'
  | 'SMS'
  | 'Email'
  | 'Custom';

export type GhlWebhookDirection = 'inbound' | 'outbound';

export interface GhlWebhookPayload {
  type: GhlWebhookType;
  locationId: string;
  contactId: string;
  conversationId?: string;
  body: string;
  messageType: GhlWebhookMessageType;
  direction: GhlWebhookDirection;
  /** ID interno del mensaje en GHL. */
  messageId?: string;
  /** Timestamp ISO 8601. */
  timestamp?: string;
  /** Lista de URLs de adjuntos (imágenes, audios, etc). */
  attachments?: string[];
}

/**
 * Resultado del parser para un payload normalizado al shape que el motor maneja.
 */
export interface GhlParsedInbound {
  tenantId: number;
  ghlLocationId: string;
  ghlContactId: string;
  ghlConversationId: string | null;
  channel: 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'sms';
  message: string;
  attachments: string[];
  ghlMessageId: string | null;
  timestamp: string | null;
}

export interface GhlParsedOutbound {
  tenantId: number;
  ghlLocationId: string;
  ghlContactId: string;
  ghlConversationId: string | null;
  channel: 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'sms';
  message: string;
  /** True si el body contiene ZWSP — significa que es nuestro propio mensaje IA. */
  isAiSelfEcho: boolean;
  ghlMessageId: string | null;
  timestamp: string | null;
}
