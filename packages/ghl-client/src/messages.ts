import { ghlRequest } from './api-client.js';
import type { GhlRegisterMessageInput, GhlRegisterMessageResult } from './types.js';

/**
 * Registra un mensaje INBOUND recibido por un provider externo (YCloud, ManyChat).
 *
 * Endpoint: POST /conversations/messages/inbound.
 * GHL no envía nada — solo registra el mensaje en la conversación del contacto.
 *
 * Para registrar como Custom (provider externo no nativo de GHL), se requiere
 * `conversationProviderId` configurado previamente en el panel GHL.
 */
export async function registerInboundMessage(
  apiToken: string,
  input: GhlRegisterMessageInput,
  fetchImpl?: typeof fetch,
): Promise<GhlRegisterMessageResult> {
  validateInput(input);

  const body = buildBody(input);

  const response = await ghlRequest<{
    messageId?: string;
    conversationId?: string;
  }>({
    apiToken,
    method: 'POST',
    path: '/conversations/messages/inbound',
    body,
    fetchImpl,
  });

  return {
    messageId: response.messageId ?? `ghl-inbound-${Date.now()}`,
    conversationId: response.conversationId ?? '',
  };
}

/**
 * Registra un mensaje OUTBOUND ya enviado por un provider externo. GHL solo lo
 * persiste en la conversación; no dispara envío real (eso ya lo hizo YCloud/ManyChat).
 *
 * Endpoint: POST /conversations/messages.
 * Para que GHL no intente enviar, usar `type: 'Custom'` con un
 * `conversationProviderId` registrado como custom provider.
 */
export async function registerOutboundMessage(
  apiToken: string,
  input: GhlRegisterMessageInput,
  fetchImpl?: typeof fetch,
): Promise<GhlRegisterMessageResult> {
  validateInput(input);

  const body = buildBody(input);

  const response = await ghlRequest<{
    messageId?: string;
    conversationId?: string;
  }>({
    apiToken,
    method: 'POST',
    path: '/conversations/messages',
    body,
    fetchImpl,
  });

  return {
    messageId: response.messageId ?? `ghl-outbound-${Date.now()}`,
    conversationId: response.conversationId ?? '',
  };
}

function validateInput(input: GhlRegisterMessageInput): void {
  if (!input.contactId) throw new Error('registerMessage: contactId requerido');
  if (!input.message || input.message.trim().length === 0) {
    throw new Error('registerMessage: message vacío');
  }
  if (!input.type) throw new Error('registerMessage: type requerido');
}

function buildBody(input: GhlRegisterMessageInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: input.type,
    contactId: input.contactId,
    message: input.message,
  };
  if (input.date) body.date = input.date;
  if (input.conversationProviderId) body.conversationProviderId = input.conversationProviderId;
  if (input.attachments && input.attachments.length > 0) body.attachments = input.attachments;
  return body;
}
