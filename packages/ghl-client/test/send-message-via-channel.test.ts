import { describe, it, expect, vi } from 'vitest';
import {
  AI_ZWSP_TAG,
  appendZwspIfMissing,
  sendMessageViaChannel,
} from '../src/messages.js';

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('appendZwspIfMissing', () => {
  it('appends ZWSP when not present', () => {
    const result = appendZwspIfMissing('hola');
    expect(result).toBe(`hola${AI_ZWSP_TAG}`);
    expect(result.endsWith(AI_ZWSP_TAG)).toBe(true);
  });

  it('is idempotent when ZWSP already present', () => {
    const input = `hola${AI_ZWSP_TAG}`;
    const result = appendZwspIfMissing(input);
    expect(result).toBe(input);
  });

  it('handles ZWSP in middle (still detected as present)', () => {
    const input = `ho${AI_ZWSP_TAG}la`;
    const result = appendZwspIfMissing(input);
    expect(result).toBe(input); // idempotent — detecta ZWSP en cualquier posición
  });
});

describe('sendMessageViaChannel', () => {
  it('hits POST /conversations/messages with type=IG and ZWSP-tagged text', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({ messageId: 'msg_1', conversationId: 'conv_1' }),
    });

    const result = await sendMessageViaChannel(
      'tok_pit',
      {
        contactId: 'cnt_xyz',
        channelType: 'IG',
        text: 'Verga, eso tiene que ser frustrante.',
      },
      fetchImpl,
    );

    expect(result.messageId).toBe('msg_1');
    expect(result.conversationId).toBe('conv_1');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/conversations/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok_pit');
    expect(init.headers.Version).toBe('2021-07-28');

    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('IG');
    expect(body.contactId).toBe('cnt_xyz');
    // ZWSP debe estar presente en el mensaje enviado
    expect(body.message.endsWith(AI_ZWSP_TAG)).toBe(true);
    expect(body.message).toContain('frustrante');
  });

  it('does not duplicate ZWSP if already present in text', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ messageId: 'm', conversationId: 'c' }),
    });
    await sendMessageViaChannel(
      'tok',
      { contactId: 'c', channelType: 'IG', text: `hola${AI_ZWSP_TAG}` },
      fetchImpl,
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    // No debe tener doble ZWSP
    const occurrences = (body.message as string).split(AI_ZWSP_TAG).length - 1;
    expect(occurrences).toBe(1);
  });

  it('supports FB Messenger', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ messageId: 'm', conversationId: 'c' }),
    });
    await sendMessageViaChannel(
      'tok',
      { contactId: 'c', channelType: 'FB Messenger', text: 'hi' },
      fetchImpl,
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.type).toBe('FB Messenger');
  });

  it('rejects empty text and missing fields', async () => {
    await expect(
      sendMessageViaChannel('tok', { contactId: '', channelType: 'IG', text: 'hi' }),
    ).rejects.toThrow(/contactId/);
    await expect(
      sendMessageViaChannel('tok', { contactId: 'c', channelType: 'IG', text: '   ' }),
    ).rejects.toThrow(/vacío/);
  });
});
