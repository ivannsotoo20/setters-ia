import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail } from '../src/lib/email.js';

/**
 * Tests del helper sendEmail (Sprint Gamma 2.4) — wrapper sobre Resend API.
 *
 * Mock fetch para evitar llamadas reales. Verifica:
 *   - Skip cuando RESEND_API_KEY no configurada.
 *   - Skip cuando faltan campos required.
 *   - Happy path con response 200 + id.
 *   - Errores HTTP (4xx/5xx) capturados sin tirar.
 *   - Body parseado mal.
 *   - Network error.
 *   - reply_to header propagado.
 *   - From construido como "name <email>".
 */

const ORIGINAL_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_KEY;
  }
});

describe('sendEmail — guards', () => {
  it('returns ok:false when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendEmail({
      to: 'foo@bar.com',
      subject: 'Test',
      html: '<p>hi</p>',
      fetchImpl: vi.fn(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RESEND_API_KEY not configured/);
  });

  it('returns ok:false when required fields missing', async () => {
    const fetchMock = vi.fn();
    const r1 = await sendEmail({ to: '', subject: 'x', html: 'x', fetchImpl: fetchMock });
    expect(r1.ok).toBe(false);
    const r2 = await sendEmail({ to: 'x', subject: '', html: 'x', fetchImpl: fetchMock });
    expect(r2.ok).toBe(false);
    const r3 = await sendEmail({ to: 'x', subject: 'x', html: '', fetchImpl: fetchMock });
    expect(r3.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendEmail — happy path', () => {
  it('returns ok with id from Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ id: 'resend_abc123' }),
      text: async () => '',
    } as Response);

    const r = await sendEmail({
      to: 'trainer@fyzon.es',
      subject: 'Lead cualificado',
      html: '<p>OK</p>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('resend_abc123');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/resend\.com\/emails$/);
    const initArg = init as RequestInit;
    expect(initArg.method).toBe('POST');
    expect((initArg.headers as Record<string, string>).Authorization).toBe('Bearer test-key');

    const body = JSON.parse(initArg.body as string);
    expect(body.to).toEqual(['trainer@fyzon.es']);
    expect(body.subject).toBe('Lead cualificado');
    expect(body.from).toMatch(/Fyzon Setters/);
    expect(body.from).toMatch(/<.*@.*>/);
  });

  it('includes reply_to when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'x' }),
      text: async () => '',
    } as Response);

    await sendEmail({
      to: 'a@b.c',
      subject: 'x',
      html: '<p>x</p>',
      replyTo: 'reply@fyzon.es',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.reply_to).toBe('reply@fyzon.es');
  });
});

describe('sendEmail — errors', () => {
  it('returns ok:false on 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => '{"error":"domain not verified"}',
      json: async () => ({}),
    } as Response);

    const r = await sendEmail({
      to: 'x@y.com',
      subject: 'x',
      html: '<p>x</p>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/422/);
      expect(r.status).toBe(422);
      expect(r.bodySnippet).toMatch(/domain not verified/);
    }
  });

  it('returns ok:false on 5xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'overloaded',
      json: async () => ({}),
    } as Response);

    const r = await sendEmail({
      to: 'x@y.com',
      subject: 'x',
      html: '<p>x</p>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it('returns ok:false when response missing id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
      text: async () => '',
    } as Response);

    const r = await sendEmail({
      to: 'x@y.com',
      subject: 'x',
      html: '<p>x</p>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing id/);
  });

  it('returns ok:false on network error (fetch throws)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const r = await sendEmail({
      to: 'x@y.com',
      subject: 'x',
      html: '<p>x</p>',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ECONNREFUSED/);
  });
});
