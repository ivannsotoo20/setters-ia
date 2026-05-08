import { describe, it, expect, vi } from 'vitest';
import {
  registerInboundMessage,
  registerOutboundMessage,
} from '../src/messages.js';

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('registerInboundMessage', () => {
  it('hits POST /conversations/messages/inbound with type Custom + conversationProviderId', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({ messageId: 'msg_1', conversationId: 'conv_1' }),
    });

    const result = await registerInboundMessage(
      'tok',
      {
        type: 'Custom',
        contactId: 'cnt_1',
        message: 'Hola, vengo del lead magnet',
        conversationProviderId: 'cp_ycloud',
        date: '2026-05-08T10:00:00Z',
      },
      fetchImpl,
    );

    expect(result.messageId).toBe('msg_1');
    expect(result.conversationId).toBe('conv_1');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/conversations/messages/inbound');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('Custom');
    expect(body.contactId).toBe('cnt_1');
    expect(body.message).toContain('lead magnet');
    expect(body.conversationProviderId).toBe('cp_ycloud');
    expect(body.date).toBe('2026-05-08T10:00:00Z');
  });

  it('falls back to synthetic messageId when GHL omits it', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ conversationId: 'conv_2' }),
    });
    const result = await registerInboundMessage(
      'tok',
      { type: 'WhatsApp', contactId: 'cnt_2', message: 'hi' },
      fetchImpl,
    );
    expect(result.messageId).toMatch(/^ghl-inbound-\d+$/);
    expect(result.conversationId).toBe('conv_2');
  });

  it('rejects empty message and missing contactId', async () => {
    await expect(
      registerInboundMessage('tok', { type: 'WhatsApp', contactId: '', message: 'hi' }),
    ).rejects.toThrow(/contactId/);
    await expect(
      registerInboundMessage('tok', { type: 'WhatsApp', contactId: 'c', message: '   ' }),
    ).rejects.toThrow(/message/);
  });
});

describe('registerOutboundMessage', () => {
  it('hits POST /conversations/messages with attachments', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({ messageId: 'msg_out', conversationId: 'conv_1' }),
    });

    const result = await registerOutboundMessage(
      'tok',
      {
        type: 'WhatsApp',
        contactId: 'cnt_1',
        message: 'Te dejo el enlace para reservar.',
        attachments: ['https://files.fyzon.es/lead-magnet.pdf'],
      },
      fetchImpl,
    );

    expect(result.messageId).toBe('msg_out');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/conversations/messages');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('WhatsApp');
    expect(body.attachments).toEqual(['https://files.fyzon.es/lead-magnet.pdf']);
  });

  it('omits attachments and conversationProviderId when not provided', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ messageId: 'm', conversationId: 'c' }),
    });
    await registerOutboundMessage(
      'tok',
      { type: 'Custom', contactId: 'cnt_1', message: 'hi' },
      fetchImpl,
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.attachments).toBeUndefined();
    expect(body.conversationProviderId).toBeUndefined();
  });
});
