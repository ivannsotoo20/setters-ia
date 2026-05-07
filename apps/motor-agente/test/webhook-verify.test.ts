import { describe, it, expect } from 'vitest';
import {
  buildYCloudSignatureHeader,
  parseYCloudSignatureHeader,
  verifyYCloudSignature,
} from '../src/lib/webhook-verify.js';

const SECRET = 'whsec_yc_test_' + 'a'.repeat(48);

describe('parseYCloudSignatureHeader', () => {
  it('parses well-formed t=,s= header', () => {
    const parsed = parseYCloudSignatureHeader('t=1620123456,s=abcdef0123456789');
    expect(parsed).toEqual({ timestamp: 1620123456, signature: 'abcdef0123456789' });
  });

  it('accepts whitespace around comma and equals', () => {
    const parsed = parseYCloudSignatureHeader('t=1620123456 , s=abcdef0123');
    expect(parsed).toEqual({ timestamp: 1620123456, signature: 'abcdef0123' });
  });

  it('lowercases hex signature', () => {
    const parsed = parseYCloudSignatureHeader('t=1620123456,s=ABCDEF0123');
    expect(parsed?.signature).toBe('abcdef0123');
  });

  it('returns null for undefined or empty header', () => {
    expect(parseYCloudSignatureHeader(undefined)).toBeNull();
    expect(parseYCloudSignatureHeader('')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parseYCloudSignatureHeader('t=1620123456')).toBeNull();
    expect(parseYCloudSignatureHeader('s=abc')).toBeNull();
  });

  it('returns null for non-numeric or non-positive timestamp', () => {
    expect(parseYCloudSignatureHeader('t=abc,s=def')).toBeNull();
    expect(parseYCloudSignatureHeader('t=-1,s=def')).toBeNull();
    expect(parseYCloudSignatureHeader('t=0,s=def')).toBeNull();
    expect(parseYCloudSignatureHeader('t=1.5,s=def')).toBeNull();
  });

  it('returns null for non-hex signature', () => {
    expect(parseYCloudSignatureHeader('t=1620123456,s=zzz')).toBeNull();
    expect(parseYCloudSignatureHeader('t=1620123456,s=')).toBeNull();
  });
});

describe('verifyYCloudSignature — golden path', () => {
  it('verifies a freshly built signature', () => {
    const body = JSON.stringify({ event: 'whatsapp.inbound_message', data: { text: 'hola' } });
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it('verifies with rawBody as Buffer', () => {
    const body = Buffer.from('{"x":42}', 'utf8');
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const result = verifyYCloudSignature({ rawBody: body, signatureHeader: header, secret: SECRET });
    expect(result.ok).toBe(true);
  });
});

describe('verifyYCloudSignature — tampering', () => {
  const body = JSON.stringify({ event: 'whatsapp.inbound_message' });

  it('rejects when body is modified after signing', () => {
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const tampered = body.replace('inbound_message', 'TAMPERED');
    const result = verifyYCloudSignature({
      rawBody: tampered,
      signatureHeader: header,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects with wrong secret', () => {
    const { header } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: 'whsec_OTHER_KEY',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects when signature hex is partially flipped', () => {
    const { header, timestamp } = buildYCloudSignatureHeader({ rawBody: body, secret: SECRET });
    const flipped = header.replace(/s=[0-9a-f]/, 's=' + (header.match(/s=([0-9a-f])/)?.[1] === '0' ? '1' : '0'));
    expect(flipped).not.toBe(header); // sanity
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: flipped,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    void timestamp;
  });
});

describe('verifyYCloudSignature — anti-replay', () => {
  const body = '{}';

  it('rejects if signature is older than tolerance window', () => {
    const longAgoSec = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const { header } = buildYCloudSignatureHeader({
      rawBody: body,
      secret: SECRET,
      timestampSeconds: longAgoSec,
    });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_too_old');
  });

  it('accepts within tolerance window', () => {
    const closeAgoSec = Math.floor(Date.now() / 1000) - 60;
    const { header } = buildYCloudSignatureHeader({
      rawBody: body,
      secret: SECRET,
      timestampSeconds: closeAgoSec,
    });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects timestamps too far in the future (clock skew >60s)', () => {
    const farFutureSec = Math.floor(Date.now() / 1000) + 1800; // 30 min ahead
    const { header } = buildYCloudSignatureHeader({
      rawBody: body,
      secret: SECRET,
      timestampSeconds: farFutureSec,
    });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_in_future');
  });

  it('uses injected nowMs (deterministic test of expiry boundary)', () => {
    const { header } = buildYCloudSignatureHeader({
      rawBody: body,
      secret: SECRET,
      timestampSeconds: 1_700_000_000,
    });
    // Inject "now" exactly 301s after timestamp → should reject
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
      nowMs: () => (1_700_000_000 + 301) * 1000,
    });
    expect(result.ok).toBe(false);
  });

  it('uses injected nowMs (boundary inside tolerance)', () => {
    const { header } = buildYCloudSignatureHeader({
      rawBody: body,
      secret: SECRET,
      timestampSeconds: 1_700_000_000,
    });
    const result = verifyYCloudSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
      nowMs: () => (1_700_000_000 + 299) * 1000,
    });
    expect(result.ok).toBe(true);
  });
});

describe('verifyYCloudSignature — malformed inputs', () => {
  it('returns malformed_header for missing or undefined header', () => {
    const r = verifyYCloudSignature({ rawBody: 'x', signatureHeader: undefined, secret: SECRET });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_header');
  });

  it('returns malformed_header for garbage header', () => {
    const r = verifyYCloudSignature({ rawBody: 'x', signatureHeader: 'not-a-valid-header', secret: SECRET });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_header');
  });

  it('returns invalid_secret if secret is empty', () => {
    const r = verifyYCloudSignature({ rawBody: 'x', signatureHeader: 't=1,s=ab', secret: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_secret');
  });
});
