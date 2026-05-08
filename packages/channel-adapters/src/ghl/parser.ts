/**
 * Parser de webhooks GHL Marketplace (InboundMessage + OutboundMessage).
 *
 * Esquema mínimo necesario para alimentar el motor Fyzon:
 *   - InboundMessage IG/FB/WhatsApp/Email → procesar con pipeline IA.
 *   - OutboundMessage cualquiera → clasificar como IA propia (ZWSP), bienvenida
 *     manual, lead-magnet auto, inbound auto-response, o humano genuino.
 */

import { z } from 'zod';
import type {
  GhlParsedInbound,
  GhlParsedOutbound,
  GhlWebhookPayload,
} from './types.js';

/** Caracter ZERO WIDTH SPACE que el motor IA apendea a cada salida. */
export const ZWSP = '​';

const ghlWebhookSchema = z.object({
  type: z.enum(['InboundMessage', 'OutboundMessage']),
  locationId: z.string().min(1),
  contactId: z.string().min(1),
  conversationId: z.string().optional(),
  body: z.string(),
  messageType: z.enum(['IG', 'FB Messenger', 'WhatsApp', 'SMS', 'Email', 'Custom']),
  direction: z.enum(['inbound', 'outbound']),
  messageId: z.string().optional(),
  timestamp: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export class GhlParseError extends Error {
  readonly issues?: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'GhlParseError';
    this.issues = issues;
  }
}

export function parseGhlWebhookPayload(payload: unknown): GhlWebhookPayload {
  const result = ghlWebhookSchema.safeParse(payload);
  if (!result.success) {
    throw new GhlParseError(
      `GHL webhook payload inválido: ${result.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`,
      result.error.issues,
    );
  }
  return result.data as GhlWebhookPayload;
}

export function parseGhlInboundMessage(
  payload: GhlWebhookPayload,
  tenantId: number,
): GhlParsedInbound {
  if (payload.type !== 'InboundMessage') {
    throw new GhlParseError(`parseGhlInboundMessage: type es '${payload.type}', esperado 'InboundMessage'`);
  }
  return {
    tenantId,
    ghlLocationId: payload.locationId,
    ghlContactId: payload.contactId,
    ghlConversationId: payload.conversationId ?? null,
    channel: mapMessageTypeToChannel(payload.messageType),
    message: payload.body,
    attachments: payload.attachments ?? [],
    ghlMessageId: payload.messageId ?? null,
    timestamp: payload.timestamp ?? null,
  };
}

export function parseGhlOutboundMessage(
  payload: GhlWebhookPayload,
  tenantId: number,
): GhlParsedOutbound {
  if (payload.type !== 'OutboundMessage') {
    throw new GhlParseError(`parseGhlOutboundMessage: type es '${payload.type}', esperado 'OutboundMessage'`);
  }
  return {
    tenantId,
    ghlLocationId: payload.locationId,
    ghlContactId: payload.contactId,
    ghlConversationId: payload.conversationId ?? null,
    channel: mapMessageTypeToChannel(payload.messageType),
    message: payload.body,
    isAiSelfEcho: containsZwsp(payload.body),
    ghlMessageId: payload.messageId ?? null,
    timestamp: payload.timestamp ?? null,
  };
}

/** True si el cuerpo del mensaje contiene ZWSP (nuestro tag de mensaje IA). */
export function containsZwsp(text: string): boolean {
  return typeof text === 'string' && text.includes(ZWSP);
}

/**
 * Mapping del messageType GHL al canal interno del motor Fyzon.
 * GHL usa 'IG' para Instagram DM, 'FB Messenger' para Facebook Messenger.
 */
function mapMessageTypeToChannel(
  messageType: GhlWebhookPayload['messageType'],
): GhlParsedInbound['channel'] {
  switch (messageType) {
    case 'IG':
      return 'instagram';
    case 'FB Messenger':
      return 'facebook';
    case 'WhatsApp':
      return 'whatsapp';
    case 'Email':
      return 'email';
    case 'SMS':
      return 'sms';
    case 'Custom':
      // Default plausible — el caller debería validar antes si Custom no es esperable.
      return 'whatsapp';
  }
}
