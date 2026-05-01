import { manyChatSendContent } from './api-client.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';
import { parseManyChatInbound } from './parser.js';

export interface ManyChatWhatsAppAdapterOptions {
  apiKey: string;
  /** Override URL base (testing). */
  baseUrl?: string;
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Tag por defecto. WhatsApp generalmente no requiere uno; lo permitimos por consistencia. */
  defaultMessageTag?: string;
}

export class ManyChatWhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  constructor(private readonly options: ManyChatWhatsAppAdapterOptions) {
    if (!options.apiKey) throw new Error('ManyChatWhatsAppAdapter: apiKey requerida');
  }

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const result = await manyChatSendContent({
      apiKey: this.options.apiKey,
      subscriberId: message.externalUserId,
      text: message.text,
      messageTag: this.options.defaultMessageTag ?? 'ACCOUNT_UPDATE',
      baseUrl: this.options.baseUrl,
      fetchImpl: this.options.fetchImpl,
    });
    return { providerMessageId: result.providerMessageId };
  }

  parseInbound(rawPayload: unknown, tenantId: string): InboundMessage | null {
    try {
      const tenantNum = Number(tenantId);
      if (!Number.isFinite(tenantNum)) return null;
      const { message } = parseManyChatInbound(rawPayload, tenantNum);
      return message.channel === 'whatsapp' ? message : null;
    } catch {
      return null;
    }
  }
}
