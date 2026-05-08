import { ghlRequest } from './api-client.js';
import type { GhlRegisterMessageInput, GhlRegisterMessageResult } from './types.js';

/** Caracter ZERO WIDTH SPACE — apendido automáticamente a cada salida IA
 * para que el webhook OutboundMessage de GHL pueda distinguir nuestros propios
 * mensajes (que vuelven por el webhook) de mensajes humanos genuinos. */
export const AI_ZWSP_TAG = '​';

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

/**
 * Envía un mensaje al lead via canal nativo GHL (IG / FB Messenger / SMS / Email).
 *
 * GHL recibe el POST y dispara el envío real por su conector configurado en la
 * sub-cuenta. NO usa Custom — usa el canal nativo (`type='IG'/'FB Messenger'/...`)
 * cuando el conector está activo en GHL Settings → Integrations.
 *
 * Apendea automáticamente ZWSP (zero width space) al final del mensaje. Esto
 * permite distinguir, cuando GHL re-emita el OutboundMessage por webhook, que
 * fue el motor IA quien lo envió (no un humano via panel GHL). Si el caller
 * NO quiere ZWSP, puede usar `registerOutboundMessage` directamente.
 *
 * Endpoint: POST /conversations/messages
 */
export interface GhlSendMessageInput {
  contactId: string;
  channelType: 'IG' | 'FB Messenger' | 'WhatsApp' | 'SMS' | 'Email';
  text: string;
  attachments?: string[];
}

export async function sendMessageViaChannel(
  apiToken: string,
  input: GhlSendMessageInput,
  fetchImpl?: typeof fetch,
): Promise<GhlRegisterMessageResult> {
  if (!input.contactId) throw new Error('sendMessageViaChannel: contactId requerido');
  if (!input.channelType) throw new Error('sendMessageViaChannel: channelType requerido');
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('sendMessageViaChannel: text vacío');
  }

  const taggedText = appendZwspIfMissing(input.text);

  const body: Record<string, unknown> = {
    type: input.channelType,
    contactId: input.contactId,
    message: taggedText,
  };
  if (input.attachments && input.attachments.length > 0) body.attachments = input.attachments;

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
    messageId: response.messageId ?? `ghl-send-${Date.now()}`,
    conversationId: response.conversationId ?? '',
  };
}

/** Apendea ZWSP al final si no está ya presente — idempotente. */
export function appendZwspIfMissing(text: string): string {
  if (typeof text !== 'string') return text;
  return text.includes(AI_ZWSP_TAG) ? text : text + AI_ZWSP_TAG;
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
