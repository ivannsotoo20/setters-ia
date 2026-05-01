import type { InboundMessage, Channel } from '../types.js';
import { manyChatInboundPayloadSchema, type ManyChatInboundPayload } from './types.js';

/**
 * Valida un payload crudo de ManyChat y lo normaliza al modelo interno InboundMessage.
 *
 * Lanza Error si el payload no cumple el schema Zod (el caller debe mapear a 400).
 *
 * Responsabilidad limitada a normalizar:
 *  - no persiste nada en DB (eso lo hace lead-ingest en el motor)
 *  - no deduplica (eso lo hace Redis en el motor)
 *  - no gestiona media mas alla de copiar media_url + tipo
 */
export function parseManyChatInbound(
  rawPayload: unknown,
  tenantId: number,
): { payload: ManyChatInboundPayload; message: InboundMessage } {
  const payload = manyChatInboundPayloadSchema.parse(rawPayload);

  const channel: Channel = payload.subscriber.channel;
  const timestampMs = payload.timestamp ?? Date.now();

  const mediaType = mapInputTypeToMediaType(payload.last_input_type);

  const message: InboundMessage = {
    tenantId: String(tenantId),
    externalUserId: payload.subscriber.id,
    channel,
    text: payload.last_input_text,
    mediaUrl: payload.media_url ?? undefined,
    mediaType,
    timestampMs,
    rawPayload: payload,
  };

  return { payload, message };
}

function mapInputTypeToMediaType(
  inputType: ManyChatInboundPayload['last_input_type'],
): InboundMessage['mediaType'] {
  switch (inputType) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'file':
      return 'document';
    case 'text':
    default:
      return undefined;
  }
}
