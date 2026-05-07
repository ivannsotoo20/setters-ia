import { ycloudSendText } from './api-client.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';
import { parseYCloudInbound } from './parser.js';

export interface YCloudWhatsAppAdapterOptions {
  apiKey: string;
  /** Número del business en E.164 (ej '+34611223344'). Va como `from` en sendDirectly. */
  businessPhone: string;
  /** Override URL base (testing). */
  baseUrl?: string;
  /** Override fetch (testing). */
  fetchImpl?: typeof fetch;
}

export class YCloudWhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  constructor(private readonly options: YCloudWhatsAppAdapterOptions) {
    if (!options.apiKey) throw new Error('YCloudWhatsAppAdapter: apiKey requerida');
    if (!options.businessPhone) {
      throw new Error('YCloudWhatsAppAdapter: businessPhone requerido');
    }
  }

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const result = await ycloudSendText({
      apiKey: this.options.apiKey,
      from: this.options.businessPhone,
      to: message.externalUserId,
      text: message.text,
      baseUrl: this.options.baseUrl,
      fetchImpl: this.options.fetchImpl,
    });
    return { providerMessageId: result.providerMessageId };
  }

  parseInbound(rawPayload: unknown, tenantId: string): InboundMessage | null {
    try {
      const tenantNum = Number(tenantId);
      if (!Number.isFinite(tenantNum)) return null;
      const { message } = parseYCloudInbound(rawPayload, tenantNum);
      return message ?? null;
    } catch {
      return null;
    }
  }
}
