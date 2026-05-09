import { createPublicKey, createVerify } from 'node:crypto';

/**
 * GHL Marketplace webhook signature verification (Bloque C.2).
 *
 * Formato:
 *   - Header `x-wh-signature` contiene la firma en base64.
 *   - Algoritmo: SHA256withRSA (PKCS#1 v1.5).
 *   - Signed payload: el body crudo del request (UTF-8 bytes).
 *   - La clave pública la distribuye GHL (Marketplace docs); se configura via env
 *     `GHL_WEBHOOK_PUBLIC_KEY_PEM`.
 *
 * GHL no incluye timestamp en el header (no hay anti-replay nativo). Si el body
 * tiene un campo `timestamp`/`dateAdded` el caller puede chequearlo aparte.
 *
 * Diseño:
 *   - Función pura, no lee env, no hace I/O.
 *   - Devuelve `{ ok, reason? }` en vez de throw.
 *   - Tolera errores de parseo del PEM devolviendo `invalid_public_key`.
 */

export interface VerifyGhlOptions {
  /** Body HTTP crudo (Buffer o string UTF-8). */
  rawBody: Buffer | string;
  /** Header `x-wh-signature` literal (base64). */
  signatureHeader: string | undefined;
  /** Clave pública GHL en formato PEM (BEGIN PUBLIC KEY ... END PUBLIC KEY). */
  publicKeyPem: string;
}

export type VerifyGhlResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_signature'
        | 'invalid_signature_format'
        | 'invalid_public_key'
        | 'signature_mismatch';
    };

export function verifyGhlSignature(opts: VerifyGhlOptions): VerifyGhlResult {
  if (!opts.signatureHeader || typeof opts.signatureHeader !== 'string') {
    return { ok: false, reason: 'missing_signature' };
  }
  const sig = opts.signatureHeader.trim();
  if (sig.length === 0) return { ok: false, reason: 'missing_signature' };
  // base64 esperado — chars + '/=' permitidos
  if (!/^[A-Za-z0-9+/=]+$/.test(sig)) {
    return { ok: false, reason: 'invalid_signature_format' };
  }

  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey({
      key: opts.publicKeyPem,
      format: 'pem',
    });
  } catch {
    return { ok: false, reason: 'invalid_public_key' };
  }

  const bodyBuf = Buffer.isBuffer(opts.rawBody)
    ? opts.rawBody
    : Buffer.from(opts.rawBody, 'utf8');

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(bodyBuf);
    verifier.end();
    const valid = verifier.verify(key, sig, 'base64');
    if (!valid) return { ok: false, reason: 'signature_mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
}

/**
 * Modo configurable de verificación, igual patrón que webhook-verify YCloud.
 *   - 'disabled': skip total. Útil en dev sin pubkey.
 *   - 'warn': verifica si hay header + pubkey; si falla, log warn y continúa.
 *   - 'enforce': falta firma o falla → 401.
 */
export type GhlVerifyMode = 'disabled' | 'warn' | 'enforce';

export function isValidGhlVerifyMode(value: unknown): value is GhlVerifyMode {
  return value === 'disabled' || value === 'warn' || value === 'enforce';
}
