import { describe, it, expect, vi } from 'vitest';
import { manyChatSendContent, ManyChatApiError } from '../src/manychat/api-client.js';
import { ManyChatInstagramAdapter } from '../src/manychat/instagram.js';

function makeFetchMock(response: { ok: boolean; status: number; json: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: () => Promise.resolve(response.json),
  });
}

describe('manyChatSendContent', () => {
  it('hits POST /fb/sending/sendContent with bearer auth and correct body', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { status: 'success', data: { message_id: 'mc_xyz' } },
    });

    const result = await manyChatSendContent({
      apiKey: '3738205:secret',
      subscriberId: '1348224655',
      text: 'Verga, eso tiene que ser frustrante.',
      fetchImpl,
    });

    expect(result.providerMessageId).toBe('mc_xyz');
    expect(result.status).toBe('success');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.manychat.com/fb/sending/sendContent');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer 3738205:secret');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.subscriber_id).toBe('1348224655');
    expect(body.data.content.messages[0].text).toContain('frustrante');
    expect(body.message_tag).toBe('ACCOUNT_UPDATE');
  });

  it('throws ManyChatApiError on non-2xx', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 401,
      json: { status: 'error', message: 'Invalid API token' },
    });
    await expect(
      manyChatSendContent({ apiKey: 'bad', subscriberId: '1', text: 'x', fetchImpl }),
    ).rejects.toBeInstanceOf(ManyChatApiError);
  });

  it('rejects empty text and missing apiKey/subscriber', async () => {
    await expect(
      manyChatSendContent({ apiKey: '', subscriberId: '1', text: 'x' }),
    ).rejects.toThrow(/apiKey/);
    await expect(
      manyChatSendContent({ apiKey: 'k', subscriberId: '', text: 'x' }),
    ).rejects.toThrow(/subscriberId/);
    await expect(
      manyChatSendContent({ apiKey: 'k', subscriberId: '1', text: '   ' }),
    ).rejects.toThrow(/vacío/);
  });

  it('falls back to synthetic providerMessageId if ManyChat omits message_id', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { status: 'success', data: {} },
    });
    const result = await manyChatSendContent({
      apiKey: 'k',
      subscriberId: '1',
      text: 'hi',
      fetchImpl,
    });
    expect(result.providerMessageId).toMatch(/^manychat-\d+$/);
  });
});

describe('ManyChatInstagramAdapter.send', () => {
  it('forwards via api-client and returns providerMessageId', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { status: 'success', data: { message_id: 'mc_ig_1' } },
    });
    const adapter = new ManyChatInstagramAdapter({ apiKey: 'k', fetchImpl });
    const out = await adapter.send({
      tenantId: '2',
      externalUserId: '1348224655',
      channel: 'instagram',
      text: '¡Brutal!',
    });
    expect(out.providerMessageId).toBe('mc_ig_1');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws if no apiKey on construction', () => {
    expect(() => new ManyChatInstagramAdapter({ apiKey: '' })).toThrow(/apiKey/);
  });
});
