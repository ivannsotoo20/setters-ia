import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  CryptoError,
  decrypt,
  decryptWithDefault,
  encrypt,
  encryptWithDefault,
  getDefaultKey,
} from '../src/lib/crypto.js';

const KEY_HEX_A = randomBytes(32).toString('hex');
const KEY_HEX_B = randomBytes(32).toString('hex');
const keyA = Buffer.from(KEY_HEX_A, 'hex');
const keyB = Buffer.from(KEY_HEX_B, 'hex');

describe('crypto encrypt/decrypt round-trip', () => {
  it('round-trips ASCII strings', () => {
    const blob = encrypt('hello world', keyA);
    expect(decrypt(blob, keyA)).toBe('hello world');
  });

  it('round-trips Unicode (Spanish + emoji)', () => {
    const text = 'Hola Iván, soy el setter 🤖 — ¿en qué te ayudo?';
    const blob = encrypt(text, keyA);
    expect(decrypt(blob, keyA)).toBe(text);
  });

  it('round-trips JSON anidado', () => {
    const payload = JSON.stringify({
      api_key: 'pk_live_' + 'a'.repeat(32),
      nested: { foo: 'bar', n: 42 },
      list: ['x', 'y', 'z'],
    });
    const blob = encrypt(payload, keyA);
    expect(decrypt(blob, keyA)).toBe(payload);
  });

  it('emits unique IVs (different ciphertext for same plaintext)', () => {
    const a = encrypt('same input', keyA);
    const b = encrypt('same input', keyA);
    expect(a).not.toBe(b);
    // pero ambos descifran al mismo plaintext
    expect(decrypt(a, keyA)).toBe('same input');
    expect(decrypt(b, keyA)).toBe('same input');
  });

  it('emits the v1 prefix', () => {
    const blob = encrypt('x', keyA);
    expect(blob.startsWith('v1:')).toBe(true);
  });
});

describe('crypto tampering detection', () => {
  it('throws if ciphertext is modified', () => {
    const blob = encrypt('sensitive payload', keyA);
    const parts = blob.split(':');
    // flip last byte of ciphertext (parts[2])
    const ct = Buffer.from(parts[2], 'base64');
    ct[ct.length - 1] ^= 0xff;
    const tampered = [parts[0], parts[1], ct.toString('base64'), parts[3]].join(':');
    expect(() => decrypt(tampered, keyA)).toThrow(CryptoError);
  });

  it('throws if auth tag is modified', () => {
    const blob = encrypt('sensitive payload', keyA);
    const parts = blob.split(':');
    const tag = Buffer.from(parts[3], 'base64');
    tag[0] ^= 0xff;
    const tampered = [parts[0], parts[1], parts[2], tag.toString('base64')].join(':');
    expect(() => decrypt(tampered, keyA)).toThrow(CryptoError);
  });

  it('throws if iv is modified', () => {
    const blob = encrypt('sensitive payload', keyA);
    const parts = blob.split(':');
    const iv = Buffer.from(parts[1], 'base64');
    iv[0] ^= 0xff;
    const tampered = [parts[0], iv.toString('base64'), parts[2], parts[3]].join(':');
    expect(() => decrypt(tampered, keyA)).toThrow(CryptoError);
  });

  it('throws when decrypting with wrong key', () => {
    const blob = encrypt('sensitive payload', keyA);
    expect(() => decrypt(blob, keyB)).toThrow(CryptoError);
  });
});

describe('crypto malformed input', () => {
  it('throws on unsupported version prefix', () => {
    const blob = encrypt('x', keyA);
    const parts = blob.split(':');
    const fake = ['v2', parts[1], parts[2], parts[3]].join(':');
    expect(() => decrypt(fake, keyA)).toThrow(/unsupported version/);
  });

  it('throws on malformed blob (wrong number of parts)', () => {
    expect(() => decrypt('not-a-blob', keyA)).toThrow(/malformed blob/);
    expect(() => decrypt('v1:onlytwo', keyA)).toThrow(/malformed blob/);
    expect(() => decrypt('a:b:c:d:e', keyA)).toThrow(/malformed blob/);
  });

  it('throws on key with wrong length', () => {
    const shortKey = Buffer.alloc(16);
    expect(() => encrypt('x', shortKey)).toThrow(/key must be 32 bytes/);
    expect(() => decrypt(encrypt('x', keyA), shortKey)).toThrow(/key must be 32 bytes/);
  });

  it('throws on iv with wrong length', () => {
    const blob = encrypt('x', keyA);
    const parts = blob.split(':');
    const badIv = Buffer.alloc(8); // 8 bytes != 12
    const fake = [parts[0], badIv.toString('base64'), parts[2], parts[3]].join(':');
    expect(() => decrypt(fake, keyA)).toThrow(/iv must be 12 bytes/);
  });
});

describe('crypto getDefaultKey', () => {
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
    expect(() => getDefaultKey()).toThrow(/CREDENTIALS_ENCRYPTION_KEY is not set/);
  });

  it('throws if env var has wrong format', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'not-hex';
    expect(() => getDefaultKey()).toThrow(/expected 32 bytes hex/);
  });

  it('returns a Buffer when env var is valid', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_HEX_A;
    const key = getDefaultKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('encryptWithDefault + decryptWithDefault round-trip', () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_HEX_A;
    const blob = encryptWithDefault('round-trip default');
    expect(decryptWithDefault(blob)).toBe('round-trip default');
  });
});
