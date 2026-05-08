import { describe, it, expect, vi } from 'vitest';
import { upsertContact, updateContactCustomFields } from '../src/contacts.js';
import { GhlApiError } from '../src/api-client.js';

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('upsertContact', () => {
  it('hits POST /contacts/upsert with locationId + phone + customFields', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({
        contact: { id: 'cnt_xyz', phone: '+34639541043', firstName: 'Juan' },
        new: true,
      }),
    });

    const result = await upsertContact(
      'tok',
      {
        locationId: 'loc_1',
        phone: '+34639541043',
        firstName: 'Juan',
        customFields: [{ id: 'cf_external_id', value: '34639541043' }],
        source: 'fyzon-setter',
      },
      fetchImpl,
    );

    expect(result.contact.id).toBe('cnt_xyz');
    expect(result.isNew).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/contacts/upsert');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.locationId).toBe('loc_1');
    expect(body.phone).toBe('+34639541043');
    expect(body.firstName).toBe('Juan');
    expect(body.source).toBe('fyzon-setter');
    expect(body.customFields).toEqual([{ id: 'cf_external_id', value: '34639541043' }]);
  });

  it('returns isNew=false when GHL responds new=false', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({ contact: { id: 'cnt_old' }, new: false }),
    });
    const result = await upsertContact('tok', { locationId: 'loc_1', email: 'a@b.com' }, fetchImpl);
    expect(result.isNew).toBe(false);
  });

  it('rejects when neither phone nor email is provided', async () => {
    await expect(
      upsertContact('tok', { locationId: 'loc_1' }),
    ).rejects.toThrow(/phone o email/);
  });

  it('rejects when locationId is missing', async () => {
    await expect(
      upsertContact('tok', { locationId: '', phone: '+1' }),
    ).rejects.toThrow(/locationId/);
  });

  it('throws GhlApiError on 401 with parsed body', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 401,
      text: JSON.stringify({ message: 'Bad token' }),
    });
    await expect(
      upsertContact('bad', { locationId: 'loc_1', phone: '+1' }, fetchImpl),
    ).rejects.toBeInstanceOf(GhlApiError);
  });

  it('throws when GHL response has no contact.id', async () => {
    const fetchImpl = makeFetchMock({ ok: true, status: 200, text: '{}' });
    await expect(
      upsertContact('tok', { locationId: 'loc_1', phone: '+1' }, fetchImpl),
    ).rejects.toThrow(/contact.id/);
  });
});

describe('updateContactCustomFields', () => {
  it('hits PUT /contacts/{id} with customFields body', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({
        contact: { id: 'cnt_1', customFields: [{ id: 'cf_1', value: 'updated' }] },
      }),
    });

    const updated = await updateContactCustomFields(
      'tok',
      'cnt_1',
      [{ id: 'cf_1', value: 'updated' }],
      fetchImpl,
    );

    expect(updated.id).toBe('cnt_1');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/contacts/cnt_1');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body.customFields).toEqual([{ id: 'cf_1', value: 'updated' }]);
  });

  it('rejects empty customFields', async () => {
    await expect(
      updateContactCustomFields('tok', 'cnt_1', []),
    ).rejects.toThrow(/customFields/);
  });

  it('rejects empty contactId', async () => {
    await expect(
      updateContactCustomFields('tok', '', [{ id: 'cf', value: 'v' }]),
    ).rejects.toThrow(/contactId/);
  });
});
