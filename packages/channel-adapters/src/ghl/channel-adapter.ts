/**
 * GhlChannelAdapter — adapter genérico que envía via API GHL.
 *
 * Soporta 3 canales (whatsapp / instagram / facebook). El channel se determina
 * en construct, y el send() llama a `sendMessageViaChannel` apendiendo ZWSP
 * automáticamente para que el OutboundMessage que GHL re-emita por webhook se
 * pueda detectar como propio del motor IA.
 */

import { sendMessageViaChannel, type GhlSendMessageInput } from '@fyzon/ghl-client';
import type { Channel, ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export interface GhlChannelAdapterParams {
  apiToken: string;
  /** Canal interno Fyzon. Determina el `type` GHL al enviar. */
  channel: Channel;
  fetchImpl?: typeof fetch;
}

export class GhlChannelAdapter implements ChannelAdapter {
  readonly channel: Channel;
  private readonly apiToken: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(params: GhlChannelAdapterParams) {
    if (!params.apiToken) throw new Error('GhlChannelAdapter: apiToken requerido');
    if (!params.channel) throw new Error('GhlChannelAdapter: channel requerido');
    this.apiToken = params.apiToken;
    this.channel = params.channel;
    this.fetchImpl = params.fetchImpl;
  }

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const input: GhlSendMessageInput = {
      contactId: message.externalUserId,
      channelType: mapChannelToGhlType(this.channel),
      text: message.text,
    };
    const result = await sendMessageViaChannel(this.apiToken, input, this.fetchImpl);
    return { providerMessageId: result.messageId };
  }

  /**
   * GHL inbound parsing va via webhook receiver (no este adapter). Devolvemos
   * null para indicar que parseInbound no aplica a este flujo.
   */
  parseInbound(_rawPayload: unknown, _tenantId: string): InboundMessage | null {
    return null;
  }
}

function mapChannelToGhlType(channel: Channel): GhlSendMessageInput['channelType'] {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'instagram':
      return 'IG';
    case 'facebook':
      return 'FB Messenger';
  }
}
