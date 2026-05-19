import { describe, it, expect, vi } from 'vitest';
import { ghlSendTemplate, GhlTemplatesError } from '../src/ghl/templates.js';

// =============================================================================
// Tests para ghlSendTemplate (Sprint Iota.5 PR-C).
// EXPERIMENTAL — la validación empírica del endpoint GHL templates se hace en
// smoke F. Estos tests solo validan el shape del request + manejo de errores.
// =============================================================================

function mockFetch(responseBody: unknown, status = 200): typeof fetch {
  return vi.fn(async () => {
    return new Response(
      typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as unknown as typeof fetch;
}

describe('ghlSendTemplate', () => {
  it('construye request con headers Bearer + Version + body shape correcto', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      // Verificar headers
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer pit-TEST123');
      expect(headers.Version).toBe('2021-07-28');
      expect(headers['Content-Type']).toBe('application/json');
      // Verificar body
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.type).toBe('WhatsApp');
      expect(body.contactId).toBe('contact_AAA');
      expect(body.templateId).toBe('tpl_BBB');
      expect(body.templateParams).toEqual(['Pablo', '+34699']);
      return new Response(JSON.stringify({ messageId: 'msg_xyz', conversationId: 'conv_123' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const result = await ghlSendTemplate({
      apiToken: 'pit-TEST123',
      contactId: 'contact_AAA',
      templateId: 'tpl_BBB',
      templateParams: ['Pablo', '+34699'],
      fetchImpl,
    });

    expect(result.providerMessageId).toBe('msg_xyz');
    expect(result.conversationId).toBe('conv_123');
  });

  it('lanza GhlTemplatesError con HTTP 4xx (template no soportado o falta scope)', async () => {
    const fetchImpl = mockFetch({ error: 'INVALID_TEMPLATE_ID' }, 422);
    await expect(
      ghlSendTemplate({
        apiToken: 'pit-x',
        contactId: 'c',
        templateId: 't',
        templateParams: [],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(GhlTemplatesError);
  });

  it('lanza GhlTemplatesError con HTTP 401 (PIT sin scope conversations/message.write)', async () => {
    const fetchImpl = mockFetch({ error: 'UNAUTHORIZED' }, 401);
    await expect(
      ghlSendTemplate({
        apiToken: 'pit-x',
        contactId: 'c',
        templateId: 't',
        templateParams: [],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'GhlTemplatesError', status: 401 });
  });

  it('rechaza input sin apiToken / contactId / templateId', async () => {
    const fetchImpl = mockFetch({});
    await expect(
      ghlSendTemplate({
        apiToken: '',
        contactId: 'c',
        templateId: 't',
        templateParams: [],
        fetchImpl,
      }),
    ).rejects.toThrow(/apiToken requerido/);
    await expect(
      ghlSendTemplate({
        apiToken: 'pit-x',
        contactId: '',
        templateId: 't',
        templateParams: [],
        fetchImpl,
      }),
    ).rejects.toThrow(/contactId requerido/);
    await expect(
      ghlSendTemplate({
        apiToken: 'pit-x',
        contactId: 'c',
        templateId: '',
        templateParams: [],
        fetchImpl,
      }),
    ).rejects.toThrow(/templateId requerido/);
  });

  it('devuelve fallback messageId si la respuesta no trae uno', async () => {
    const fetchImpl = mockFetch({}, 200); // body vacío
    const result = await ghlSendTemplate({
      apiToken: 'pit-x',
      contactId: 'c',
      templateId: 't',
      templateParams: [],
      fetchImpl,
    });
    expect(result.providerMessageId).toMatch(/^ghl-tpl-/);
    expect(result.conversationId).toBe('');
  });
});
