export type Channel = 'whatsapp' | 'instagram' | 'facebook';

export interface OutboundMessage {
  tenantId: string;
  externalUserId: string;
  channel: Channel;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface InboundMessage {
  tenantId: string;
  externalUserId: string;
  channel: Channel;
  text: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'image' | 'video' | 'document';
  timestampMs: number;
  rawPayload: unknown;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
  parseInbound(rawPayload: unknown, tenantId: string): InboundMessage | null;
}
