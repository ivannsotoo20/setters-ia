import { describe, expect, it } from 'vitest';
import { bodyKeys, safeLogBody } from '../src/lib/log-redact.js';

describe('safeLogBody', () => {
  it('redacts top-level secret keys', () => {
    const input = {
      type: 'INSTALL',
      accessToken: 'ghl-real-secret-123',
      refreshToken: 'refresh-456',
      locationId: 'loc-789',
    };
    const out = safeLogBody(input) as Record<string, unknown>;
    expect(out.accessToken).toBe('<REDACTED>');
    expect(out.refreshToken).toBe('<REDACTED>');
    expect(out.locationId).toBe('loc-789'); // not secret
    expect(out.type).toBe('INSTALL');
  });

  it('redacts nested secret keys', () => {
    const input = {
      meta: {
        credentials: { apiKey: 'sk-test-123' },
        webhook_secret: 'whs-456',
      },
    };
    const out = safeLogBody(input) as { meta: Record<string, unknown> };
    expect(out.meta.credentials).toBe('<REDACTED>');
    expect(out.meta.webhook_secret).toBe('<REDACTED>');
  });

  it('redacts inside arrays', () => {
    const input = [
      { name: 'A', token: 'aaa' },
      { name: 'B', token: 'bbb' },
    ];
    const out = safeLogBody(input) as Array<Record<string, unknown>>;
    expect(out[0]!.token).toBe('<REDACTED>');
    expect(out[0]!.name).toBe('A');
    expect(out[1]!.token).toBe('<REDACTED>');
  });

  it('matches case-insensitive secret patterns', () => {
    const input = {
      AccessToken: 'x',
      ACCESS_TOKEN: 'y',
      MyApiKey: 'z',
    };
    const out = safeLogBody(input) as Record<string, unknown>;
    expect(out.AccessToken).toBe('<REDACTED>');
    expect(out.ACCESS_TOKEN).toBe('<REDACTED>');
    expect(out.MyApiKey).toBe('<REDACTED>');
  });

  it('preserves non-secret data', () => {
    const input = {
      id: 123,
      name: 'Iván',
      phone: '+34600000000',
      active: true,
      meta: null,
    };
    expect(safeLogBody(input)).toEqual(input);
  });

  it('handles null/undefined/primitives', () => {
    expect(safeLogBody(null)).toBe(null);
    expect(safeLogBody(undefined)).toBe(undefined);
    expect(safeLogBody('plain string')).toBe('plain string');
    expect(safeLogBody(42)).toBe(42);
  });

  it('truncates beyond depth 6 to prevent stack overflow', () => {
    const deep: Record<string, unknown> = { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } };
    const out = safeLogBody(deep) as { a: { b: { c: { d: { e: { f: { g: unknown } } } } } } };
    // El recursion descends a 6 niveles. `.g` queda como el primer descendant más allá → TRUNCATED.
    expect(out.a.b.c.d.e.f.g).toBe('<TRUNCATED depth>');
  });

  it('does not mutate input', () => {
    const input = { token: 'secret', meta: { apiKey: 'k' } };
    safeLogBody(input);
    expect(input.token).toBe('secret');
    expect(input.meta.apiKey).toBe('k');
  });
});

describe('bodyKeys', () => {
  it('returns keys of plain object', () => {
    expect(bodyKeys({ a: 1, b: 2 })).toEqual(['a', 'b']);
  });

  it('returns [] for null / array / primitive', () => {
    expect(bodyKeys(null)).toEqual([]);
    expect(bodyKeys([1, 2])).toEqual([]);
    expect(bodyKeys('plain')).toEqual([]);
  });
});
