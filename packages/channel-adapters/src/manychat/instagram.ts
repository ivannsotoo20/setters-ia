import { manyChatSendContent } from './api-client.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';
import { parseManyChatInbound } from './parser.js';

export interface ManyChatInstagramAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  defaultMessageTag?: string;
}

export class ManyChatInstagramAdapter implements ChannelAdapter {
  readonly channel = 'instagram' as const;

  constructor(private readonly options: ManyChatInstagramAdapterOptions) {
    if (!options.apiKey) throw new Error('ManyChatInstagramAdapter: apiKey requerida');
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
      return message.channel === 'instagram' ? message : null;
    } catch {
      return null;
    }
  }
}
