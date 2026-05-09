import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption helper for the panel SaaS — replica del helper del
 * motor (`apps/motor-agente/src/lib/crypto.ts`) para que las credenciales BYOK
 * que el cliente pegue en `/settings/integrations` queden cifradas con el
 * mismo formato `v1:iv:ct:tag` que el motor sabe descifrar.
 *
 * Key management:
 *   - `CREDENTIALS_ENCRYPTION_KEY` env var (32 bytes hex / 64 chars).
 *   - DEBE coincidir con la del motor (root .env.local) — si no, los blobs
 *     que el panel escriba no se podrán descifrar desde el motor.
 *
 * Server-side only. Nunca importar desde un client component.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const VERSION_PREFIX = 'v1';

export class PanelCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PanelCryptoError';
  }
}

function getKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new PanelCryptoError(
      'CREDENTIALS_ENCRYPTION_KEY missing or invalid (expected 32 bytes hex / 64 chars)',
    );
  }
  return Buffer.from(keyHex, 'hex');
}

export function encryptJson(value: unknown): string {
  const key = getKey();
  if (key.length !== KEY_LENGTH) {
    throw new PanelCryptoError(`encrypt: key must be ${KEY_LENGTH} bytes`);
  }
  const plaintext = JSON.stringify(value);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION_PREFIX,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

export function decryptJson(blob: string): unknown {
  const key = getKey();
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new PanelCryptoError('decrypt: invalid blob format (expected v1:iv:ct:tag)');
  }
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const ciphertext = Buffer.from(parts[2]!, 'base64');
    const tag = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as unknown;
  } catch (err) {
    throw new PanelCryptoError(`decrypt: ${(err as Error).message}`);
  }
}
