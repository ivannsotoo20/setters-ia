import { describe, it, expect, vi } from 'vitest';
import { ghlRequest, GhlApiError } from '../src/api-client.js';

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('ghlRequest', () => {
  it('builds base URL + path + query and sends required headers', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ pipelines: [] }),
    });

    await ghlRequest({
      apiToken: 'tok_xxx',
      method: 'GET',
      path: '/opportunities/pipelines',
      query: { locationId: 'loc_1', limit: 10 },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://services.leadconnectorhq.com/opportunities/pipelines?locationId=loc_1&limit=10',
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok_xxx');
    expect(init.headers.Version).toBe('2021-07-28');
    expect(init.headers.Accept).toBe('application/json');
    // GET sin body → no debe haber Content-Type
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('serializes body and sets Content-Type for POST', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ contact: { id: 'c_1' }, new: true }),
    });

    const result = await ghlRequest<{ contact: { id: string }; new: boolean }>({
      apiToken: 'tok',
      method: 'POST',
      path: '/contacts/upsert',
      body: { locationId: 'loc_1', phone: '+1' },
      fetchImpl,
    });

    expect(result.contact.id).toBe('c_1');
    expect(result.new).toBe(true);

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.locationId).toBe('loc_1');
    expect(body.phone).toBe('+1');
  });

  it('throws GhlApiError with parsed body on 4xx', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 401,
      text: JSON.stringify({ message: 'Unauthorized' }),
    });

    let caught: unknown;
    try {
      await ghlRequest({ apiToken: 'bad', method: 'GET', path: '/x', fetchImpl });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GhlApiError);
    const err = caught as GhlApiError;
    expect(err.status).toBe(401);
    expect((err.body as { message: string }).message).toBe('Unauthorized');
  });

  it('handles empty 204 No Content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    });
    const result = await ghlRequest({ apiToken: 't', method: 'DELETE', path: '/x', fetchImpl });
    expect(result).toBeNull();
  });

  it('throws on missing apiToken', async () => {
    await expect(
      ghlRequest({ apiToken: '', method: 'GET', path: '/x' }),
    ).rejects.toThrow(/apiToken/);
  });

  it('uses custom baseUrl + version when provided', async () => {
    const fetchImpl = makeFetchMock({ ok: true, status: 200, text: '{}' });
    await ghlRequest({
      apiToken: 't',
      method: 'GET',
      path: '/x',
      baseUrl: 'https://staging.leadconnector.test/',
      version: '2024-01-01',
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://staging.leadconnector.test/x');
    expect(init.headers.Version).toBe('2024-01-01');
  });
});
