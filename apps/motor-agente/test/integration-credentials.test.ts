import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt } from '../src/lib/crypto.js';
import {
  IntegrationCredentialsError,
  decodeCredentialsRow,
} from '../src/lib/integration-credentials.js';

const KEY_HEX = randomBytes(32).toString('hex');
const KEY = Buffer.from(KEY_HEX, 'hex');

describe('decodeCredentialsRow — fallback transparente', () => {
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

  it('prefers credentials_encrypted when both are present', () => {
    const realCreds = { api_key: 'pk_live_123', extra: 'x' };
    const blob = encrypt(JSON.stringify(realCreds), KEY);
    const row = {
      credentials: { api_key: 'STALE_PLAIN_VALUE' }, // se ignora porque hay encrypted
      credentials_encrypted: { blob },
    };
    const decoded = decodeCredentialsRow(row, 42);
    expect(decoded.api_key).toBe('pk_live_123');
    expect(decoded.extra).toBe('x');
  });

  it('decrypts credentials_encrypted only (transition complete state)', () => {
    const realCreds = { api_key: 'pk_live_xyz', business_phone: '+34684703803' };
    const blob = encrypt(JSON.stringify(realCreds), KEY);
    const row = {
      credentials: null, // futuro: tras drop column
      credentials_encrypted: { blob },
    };
    const decoded = decodeCredentialsRow(row, 7);
    expect(decoded).toEqual(realCreds);
  });

  it('falls back to plain credentials when encrypted is missing', () => {
    const row = {
      credentials: { api_key: 'plain_key', other: 'val' },
      credentials_encrypted: null,
    };
    const decoded = decodeCredentialsRow(row, 1);
    expect(decoded.api_key).toBe('plain_key');
    expect(decoded.other).toBe('val');
  });

  it('falls back to plain when credentials_encrypted is empty object', () => {
    const row = {
      credentials: { api_key: 'plain_key' },
      credentials_encrypted: {}, // shape inválido — sin blob
    };
    const decoded = decodeCredentialsRow(row, 2);
    expect(decoded.api_key).toBe('plain_key');
  });

  it('falls back to plain when credentials_encrypted has empty blob', () => {
    const row = {
      credentials: { api_key: 'plain_key' },
      credentials_encrypted: { blob: '' },
    };
    const decoded = decodeCredentialsRow(row, 3);
    expect(decoded.api_key).toBe('plain_key');
  });

  it('throws when both columns are absent or null', () => {
    expect(() => decodeCredentialsRow({ credentials: null, credentials_encrypted: null }, 99)).toThrow(
      IntegrationCredentialsError,
    );
  });

  it('throws when both columns are missing', () => {
    expect(() => decodeCredentialsRow({}, 100)).toThrow(IntegrationCredentialsError);
  });

  it('throws meaningful error when blob is malformed', () => {
    const row = {
      credentials: null,
      credentials_encrypted: { blob: 'not-a-real-blob' },
    };
    expect(() => decodeCredentialsRow(row, 5)).toThrow(/failed to decrypt credentials/);
  });

  it('throws meaningful error when blob decrypts to non-JSON', () => {
    const garbage = 'plain string not json';
    const blob = encrypt(garbage, KEY);
    const row = { credentials: null, credentials_encrypted: { blob } };
    expect(() => decodeCredentialsRow(row, 6)).toThrow(/not valid JSON/);
  });

  it('throws meaningful error when decrypted JSON is an array (not an object)', () => {
    const blob = encrypt(JSON.stringify(['a', 'b']), KEY);
    const row = { credentials: null, credentials_encrypted: { blob } };
    expect(() => decodeCredentialsRow(row, 7)).toThrow(/not a JSON object/);
  });

  it('throws meaningful error when decrypted JSON is null', () => {
    const blob = encrypt(JSON.stringify(null), KEY);
    const row = { credentials: null, credentials_encrypted: { blob } };
    expect(() => decodeCredentialsRow(row, 8)).toThrow(/not a JSON object/);
  });

  it('preserves nested objects + arrays in decrypted credentials', () => {
    const creds = {
      api_key: 'k',
      meta: { region: 'eu', tier: 1 },
      tags: ['a', 'b', 'c'],
    };
    const blob = encrypt(JSON.stringify(creds), KEY);
    const row = { credentials: null, credentials_encrypted: { blob } };
    const decoded = decodeCredentialsRow(row, 9);
    expect(decoded).toEqual(creds);
  });

  it('throws when CREDENTIALS_ENCRYPTION_KEY is missing and encrypted blob exists', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const row = {
      credentials: null,
      credentials_encrypted: { blob: 'v1:abc:def:ghi' },
    };
    expect(() => decodeCredentialsRow(row, 10)).toThrow(/CREDENTIALS_ENCRYPTION_KEY is not set/);
  });

  it('does NOT require CREDENTIALS_ENCRYPTION_KEY when only plain credentials exist', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const row = {
      credentials: { api_key: 'plain_key' },
      credentials_encrypted: null,
    };
    const decoded = decodeCredentialsRow(row, 11);
    expect(decoded.api_key).toBe('plain_key');
  });
});
