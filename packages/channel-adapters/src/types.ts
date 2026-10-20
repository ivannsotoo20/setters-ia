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
  /**
   * Id del mensaje en el proveedor, el mismo en cada reintento del webhook
   * (YCloud: id del mensaje; ManyChat: `subscriber_id:timestamp` cuando el
   * payload trae timestamp). El motor lo guarda como antiduplicado en BD
   * (migration 080). Ausente si el proveedor no da nada estable.
   */
  providerMessageId?: string;
  rawPayload: unknown;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
  parseInbound(rawPayload: unknown, tenantId: string): InboundMessage | null;
}
