import { describe, it, expect } from 'vitest';
import { parseYCloudInbound } from '@fyzon/channel-adapters';

describe('parseYCloudInbound — Meta-style payload', () => {
  const tenantId = 3;

  it('parses a text inbound message with contact', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '83784929738012',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '34611223344',
                  phone_number_id: '694794789348887',
                },
                contacts: [{ profile: { name: 'Ivan' }, wa_id: '34699887766' }],
                messages: [
                  {
                    from: '34699887766',
                    id: 'wamid.HBgM123',
                    timestamp: '1714900000',
                    text: { body: 'Hola, vengo del anuncio' },
                    type: 'text',
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const { message, isStatusUpdate, dedupKey } = parseYCloudInbound(payload, tenantId);

    expect(isStatusUpdate).toBe(false);
    expect(dedupKey).toBe('ycloud-msg:wamid.HBgM123');
    expect(message).not.toBeNull();
    expect(message!.tenantId).toBe('3');
    expect(message!.externalUserId).toBe('34699887766');
    expect(message!.channel).toBe('whatsapp');
    expect(message!.text).toBe('Hola, vengo del anuncio');
    // 1714900000 (s) -> 1714900000000 (ms)
    expect(message!.timestampMs).toBe(1714900000000);
  });

  it('parses an image inbound with caption and link', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '34699887766',
                    id: 'wamid.img1',
                    timestamp: 1714900100,
                    type: 'image',
                    image: {
                      id: 'media_xyz',
                      mime_type: 'image/jpeg',
                      link: 'https://cdn.ycloud.com/media/xyz.jpg',
                      caption: 'Foto del entrenamiento',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { message } = parseYCloudInbound(payload, tenantId);
    expect(message!.mediaType).toBe('image');
    expect(message!.mediaUrl).toBe('https://cdn.ycloud.com/media/xyz.jpg');
    expect(message!.text).toBe('Foto del entrenamiento');
  });

  it('returns isStatusUpdate=true and message=null for status events', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.outbound1',
                    status: 'delivered',
                    timestamp: '1714900200',
                    recipient_id: '34699887766',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { message, isStatusUpdate, dedupKey } = parseYCloudInbound(payload, tenantId);
    expect(isStatusUpdate).toBe(true);
    expect(message).toBeNull();
    expect(dedupKey).toBe('ycloud-status:wamid.outbound1');
  });
});

describe('parseYCloudInbound — Native YCloud payload', () => {
  const tenantId = 3;

  it('parses an inbound message wrapped in whatsappInboundMessage', () => {
    const payload = {
      id: 'evt_native_1',
      type: 'whatsapp.inbound_message.received',
      whatsappInboundMessage: {
        id: 'wamid.native1',
        wabaId: 'waba_xxx',
        from: '34699887766',
        to: '34611223344',
        timestamp: 1714900300,
        type: 'text',
        text: { body: 'Hola desde nativo' },
        contact: { profile: { name: 'Ivan' }, waId: '34699887766' },
      },
    };

    const { message, isStatusUpdate, dedupKey } = parseYCloudInbound(payload, tenantId);
    expect(isStatusUpdate).toBe(false);
    expect(dedupKey).toBe('ycloud-msg:wamid.native1');
    expect(message!.text).toBe('Hola desde nativo');
    expect(message!.externalUserId).toBe('34699887766');
    expect(message!.timestampMs).toBe(1714900300000);
  });

  it('detects native status events as isStatusUpdate', () => {
    const payload = {
      id: 'evt_native_status',
      type: 'whatsapp.message.updated',
      whatsappInboundMessage: {
        id: 'wamid.outbound2',
        from: '34611223344',
        type: 'text',
      },
    };
    const { message, isStatusUpdate } = parseYCloudInbound(payload, tenantId);
    expect(isStatusUpdate).toBe(true);
    expect(message).toBeNull();
  });
});

describe('parseYCloudInbound — error cases', () => {
  it('rejects payload that is neither Meta-style nor native', () => {
    expect(() => parseYCloudInbound({ random: 'shape' }, 3)).toThrow();
  });

  it('rejects empty object', () => {
    expect(() => parseYCloudInbound({}, 3)).toThrow();
  });
});
