import { describe, it, expect, vi } from 'vitest';
import { ycloudSendText, YCloudApiError } from '../src/ycloud/api-client.js';
import { YCloudWhatsAppAdapter } from '../src/ycloud/whatsapp.js';

function makeFetchMock(response: { ok: boolean; status: number; json: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: () => Promise.resolve(response.json),
  });
}

describe('ycloudSendText', () => {
  it('hits POST /v2/whatsapp/messages/sendDirectly with X-API-Key header and text body', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { id: 'wamid.HBgM123', status: 'accepted' },
    });

    const result = await ycloudSendText({
      apiKey: 'yc_secret_xxx',
      from: '+34611223344',
      to: '34699887766',
      text: 'Verga, eso tiene que ser frustrante.',
      fetchImpl,
    });

    expect(result.providerMessageId).toBe('wamid.HBgM123');
    expect(result.status).toBe('accepted');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe('yc_secret_xxx');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('+34611223344');
    expect(body.to).toBe('34699887766');
    expect(body.type).toBe('text');
    expect(body.text.body).toContain('frustrante');
  });

  it('normalizes phone numbers stripping spaces and dashes', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { id: 'wamid.x', status: 'accepted' },
    });
    await ycloudSendText({
      apiKey: 'k',
      from: '+34 611-223-344',
      to: '34 699 887 766',
      text: 'hola',
      fetchImpl,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.from).toBe('+34611223344');
    expect(body.to).toBe('34699887766');
  });

  it('throws YCloudApiError on non-2xx', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 401,
      json: { error: { code: 'invalid_api_key', message: 'Invalid API key' } },
    });
    await expect(
      ycloudSendText({ apiKey: 'bad', from: '+1', to: '1', text: 'x', fetchImpl }),
    ).rejects.toBeInstanceOf(YCloudApiError);
  });

  it('rejects empty text and missing apiKey/from/to', async () => {
    await expect(
      ycloudSendText({ apiKey: '', from: '+1', to: '1', text: 'x' }),
    ).rejects.toThrow(/apiKey/);
    await expect(
      ycloudSendText({ apiKey: 'k', from: '', to: '1', text: 'x' }),
    ).rejects.toThrow(/from/);
    await expect(
      ycloudSendText({ apiKey: 'k', from: '+1', to: '', text: 'x' }),
    ).rejects.toThrow(/to/);
    await expect(
      ycloudSendText({ apiKey: 'k', from: '+1', to: '1', text: '   ' }),
    ).rejects.toThrow(/vacío/);
  });

  it('falls back to synthetic providerMessageId if YCloud omits id and wamid', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { status: 'accepted' },
    });
    const result = await ycloudSendText({
      apiKey: 'k',
      from: '+1',
      to: '1',
      text: 'hi',
      fetchImpl,
    });
    expect(result.providerMessageId).toMatch(/^ycloud-\d+$/);
  });
});

describe('YCloudWhatsAppAdapter.send', () => {
  it('forwards via api-client and returns providerMessageId', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      json: { id: 'wamid.adapter1', status: 'accepted' },
    });
    const adapter = new YCloudWhatsAppAdapter({
      apiKey: 'k',
      businessPhone: '+34611223344',
      fetchImpl,
    });
    const out = await adapter.send({
      tenantId: '3',
      externalUserId: '34699887766',
      channel: 'whatsapp',
      text: '¡Brutal!',
    });
    expect(out.providerMessageId).toBe('wamid.adapter1');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws if no apiKey on construction', () => {
    expect(() => new YCloudWhatsAppAdapter({ apiKey: '', businessPhone: '+1' })).toThrow(/apiKey/);
  });

  it('throws if no businessPhone on construction', () => {
    expect(() => new YCloudWhatsAppAdapter({ apiKey: 'k', businessPhone: '' })).toThrow(/businessPhone/);
  });
});
