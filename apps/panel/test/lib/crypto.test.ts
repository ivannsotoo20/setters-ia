import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptJson, decryptJson, PanelCryptoError } from '@/lib/crypto';

const KEY_HEX = randomBytes(32).toString('hex');

describe('panel crypto encryptJson / decryptJson round-trip', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CREDENTIALS_ENCRYPTION_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_HEX;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    } else {
      process.env.CREDENTIALS_ENCRYPTION_KEY = originalEnv;
    }
  });

  it('round-trips a string-only credential blob', () => {
    const value = { api_key: 'pk_live_' + 'a'.repeat(32) };
    const blob = encryptJson(value);
    expect(decryptJson(blob)).toEqual(value);
  });

  it('round-trips Unicode (Spanish + emoji)', () => {
    const value = { note: 'Hola Iván, soy el setter 🤖 — ¿OK?' };
    const blob = encryptJson(value);
    expect(decryptJson(blob)).toEqual(value);
  });

  it('round-trips nested JSON structures', () => {
    const value = {
      api_key: 'sk_test_xyz',
      page_id: '3738205',
      nested: { foo: 'bar', n: 42, list: ['x', 'y', 'z'] },
    };
    const blob = encryptJson(value);
    expect(decryptJson(blob)).toEqual(value);
  });

  it('emits the v1 prefix', () => {
    expect(encryptJson({ a: 1 }).startsWith('v1:')).toBe(true);
  });

  it('emits unique IVs (different ciphertext for same input)', () => {
    const a = encryptJson({ same: 'input' });
    const b = encryptJson({ same: 'input' });
    expect(a).not.toBe(b);
    expect(decryptJson(a)).toEqual({ same: 'input' });
    expect(decryptJson(b)).toEqual({ same: 'input' });
  });
});

describe('panel crypto tampering detection', () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_HEX;
  });

  it('throws PanelCryptoError if ciphertext is modified', () => {
    const blob = encryptJson({ secret: 'value' });
    const parts = blob.split(':');
    const ct = Buffer.from(parts[2]!, 'base64');
    ct[ct.length - 1] = (ct[ct.length - 1] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], ct.toString('base64'), parts[3]].join(':');
    expect(() => decryptJson(tampered)).toThrow(PanelCryptoError);
  });

  it('throws PanelCryptoError if auth tag is modified', () => {
    const blob = encryptJson({ secret: 'value' });
    const parts = blob.split(':');
    const tag = Buffer.from(parts[3]!, 'base64');
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], tag.toString('base64')].join(':');
    expect(() => decryptJson(tampered)).toThrow(PanelCryptoError);
  });

  it('throws PanelCryptoError when decrypting with a different key', () => {
    const blob = encryptJson({ secret: 'value' });
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(() => decryptJson(blob)).toThrow(PanelCryptoError);
  });
});

describe('panel crypto malformed input', () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_HEX;
  });

  it('throws on unsupported version prefix', () => {
    const blob = encryptJson({ a: 1 });
    const parts = blob.split(':');
    const fake = ['v2', parts[1], parts[2], parts[3]].join(':');
    expect(() => decryptJson(fake)).toThrow(PanelCryptoError);
    expect(() => decryptJson(fake)).toThrow(/invalid blob format/);
  });

  it('throws on malformed blob (wrong number of parts)', () => {
    expect(() => decryptJson('not-a-blob')).toThrow(/invalid blob format/);
    expect(() => decryptJson('v1:onlytwo')).toThrow(/invalid blob format/);
    expect(() => decryptJson('a:b:c:d:e')).toThrow(/invalid blob format/);
  });
});

describe('panel crypto key validation', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CREDENTIALS_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    } else {
      process.env.CREDENTIALS_ENCRYPTION_KEY = originalEnv;
    }
  });

  it('throws if env var is missing', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptJson({ a: 1 })).toThrow(PanelCryptoError);
    expect(() => encryptJson({ a: 1 })).toThrow(/missing or invalid/);
  });

  it('throws if env var has wrong format (not hex)', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'not-hex-not-64-chars';
    expect(() => encryptJson({ a: 1 })).toThrow(/missing or invalid/);
  });

  it('throws if env var has wrong length (not 64 chars)', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(32);
    expect(() => encryptJson({ a: 1 })).toThrow(/missing or invalid/);
  });
});
