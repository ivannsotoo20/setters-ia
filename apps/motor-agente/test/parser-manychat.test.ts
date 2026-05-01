import { describe, it, expect } from 'vitest';
import { parseManyChatInbound } from '@fyzon/channel-adapters';

describe('parseManyChatInbound', () => {
  const tenantId = 42;

  it('parses a valid WhatsApp text payload', () => {
    const payload = {
      subscriber: {
        id: '12345',
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '+34612345678',
        channel: 'whatsapp',
      },
      last_input_text: 'Hola, vengo del anuncio',
      last_input_type: 'text',
      timestamp: 1713620000000,
    };

    const { message, payload: parsed } = parseManyChatInbound(payload, tenantId);

    expect(message.tenantId).toBe('42');
    expect(message.externalUserId).toBe('12345');
    expect(message.channel).toBe('whatsapp');
    expect(message.text).toBe('Hola, vengo del anuncio');
    expect(message.mediaType).toBeUndefined();
    expect(message.timestampMs).toBe(1713620000000);
    expect(parsed.subscriber.first_name).toBe('Juan');
  });

  it('parses an Instagram audio payload with media_url', () => {
    const payload = {
      subscriber: { id: 'ig_999', channel: 'instagram' },
      last_input_text: '',
      last_input_type: 'audio',
      media_url: 'https://lookaside.fb.com/audio-xyz.mp3',
      timestamp: '1713620100000',
    };

    const { message } = parseManyChatInbound(payload, tenantId);

    expect(message.channel).toBe('instagram');
    expect(message.mediaType).toBe('audio');
    expect(message.mediaUrl).toBe('https://lookaside.fb.com/audio-xyz.mp3');
    expect(message.timestampMs).toBe(1713620100000);
  });

  it('coerces numeric subscriber.id to string', () => {
    const payload = {
      subscriber: { id: 987654321, channel: 'facebook' },
      last_input_text: 'hey',
    };

    const { message } = parseManyChatInbound(payload, tenantId);
    expect(message.externalUserId).toBe('987654321');
  });

  it('falls back timestamp to Date.now() when missing', () => {
    const before = Date.now();
    const payload = {
      subscriber: { id: 'abc', channel: 'whatsapp' },
      last_input_text: 'hola',
    };
    const { message } = parseManyChatInbound(payload, tenantId);
    expect(message.timestampMs).toBeGreaterThanOrEqual(before);
    expect(message.timestampMs).toBeLessThanOrEqual(Date.now());
  });

  it('rejects payloads with invalid channel', () => {
    const payload = {
      subscriber: { id: '1', channel: 'telegram' }, // no soportado
      last_input_text: 'x',
    };
    expect(() => parseManyChatInbound(payload, tenantId)).toThrow();
  });

  it('rejects payloads without subscriber.id', () => {
    const payload = {
      subscriber: { channel: 'whatsapp' },
      last_input_text: 'x',
    };
    expect(() => parseManyChatInbound(payload, tenantId)).toThrow();
  });

  it('maps image input to mediaType=image', () => {
    const { message } = parseManyChatInbound(
      {
        subscriber: { id: '1', channel: 'whatsapp' },
        last_input_text: '',
        last_input_type: 'image',
        media_url: 'https://example.com/x.jpg',
      },
      tenantId,
    );
    expect(message.mediaType).toBe('image');
  });

  it('sanitizes unresolved ManyChat placeholders to null (IG lacks phone)', () => {
    const { payload } = parseManyChatInbound(
      {
        subscriber: {
          id: '1348224655',
          first_name: 'Ivan',
          last_name: 'Soto',
          phone: '{{phone}}',
          email: '  {{email}}  ',
          channel: 'instagram',
        },
        last_input_text: 'hola',
      },
      tenantId,
    );
    expect(payload.subscriber.phone).toBeNull();
    expect(payload.subscriber.email).toBeNull();
    expect(payload.subscriber.first_name).toBe('Ivan');
    expect(payload.subscriber.last_name).toBe('Soto');
  });
});
