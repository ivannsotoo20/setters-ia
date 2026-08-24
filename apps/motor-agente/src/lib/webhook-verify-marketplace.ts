import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyGhlSignature, type VerifyGhlResult } from './webhook-verify-ghl.js';

/**
 * GHL Marketplace App webhook signature verification (Bloque C.E.3).
 *
 * GHL envía webhooks de apps Marketplace con UNA de dos firmas (depende del
 * tipo de evento y configuración):
 *
 *   - **HMAC-SHA256 con Shared Secret** — header `x-ghl-signature`
 *     (formato `t=<unix_seconds>,s=<hmac_hex>` o solo `<hmac_hex>` raw).
 *     Signed payload = `${t}.${rawBody}` o solo el body si no hay timestamp.
 *
 *   - **RSA-SHA256 con public key universal GHL** — header `x-wh-signature`
 *     (firma base64). Signed payload = rawBody.
 *
 * El verifier intenta detectar cuál se usa por presencia del header y delega:
 *   - Si llega `x-wh-signature` → usa el verifier RSA existente
 *     (`webhook-verify-ghl.ts`).
 *   - Si llega `x-ghl-signature` → usa HMAC con `sharedSecret`.
 *   - Si llegan ambos → prefiere RSA (más estricto). Si llega RSA pero no hay
 *     public key configurada, cae al HMAC en vez de fallar.
 *   - Si no llega ninguno → `missing_signature`.
 *
 * Diseño puro (no lee env, no hace I/O). El caller decide qué hacer según
 * `verify_mode` (disabled / warn / enforce).
 */

export interface VerifyMarketplaceOptions {
  /** Body HTTP crudo (preservado por el contentTypeParser custom de Fastify). */
  rawBody: Buffer | string;
  /** Header `x-wh-signature` (RSA base64) si existe. */
  rsaSignatureHeader?: string | undefined;
  /** Header `x-ghl-signature` (HMAC, formato `t=...,s=...` o hex) si existe. */
  hmacSignatureHeader?: string | undefined;
  /** Public key PEM de GHL (para RSA). Si vacía, RSA no se intenta. */
  rsaPublicKeyPem?: string;
  /** Shared secret de la app Marketplace (para HMAC). Si vacía, HMAC no se intenta. */
  hmacSharedSecret?: string;
  /** Tolerancia anti-replay en segundos para timestamp HMAC. Default 300s. */
  hmacToleranceSeconds?: number;
  /** Override de `Date.now()` en ms — solo para tests. */
  nowMs?: number;
}

export type VerifyMarketplaceResult =
  | { ok: true; method: 'rsa' | 'hmac' }
  | {
      ok: false;
      reason:
        | 'missing_signature'
        | 'invalid_signature_format'
        | 'invalid_public_key'
        | 'invalid_hmac_format'
        | 'invalid_timestamp'
        | 'replay_window_exceeded'
        | 'signature_mismatch'
        | 'no_secret_configured';
    };

export function verifyMarketplaceWebhook(opts: VerifyMarketplaceOptions): VerifyMarketplaceResult {
  // Preferencia: RSA > HMAC. Solo elegimos uno (no doble-verify).
  const hasRsa = isNonEmpty(opts.rsaSignatureHeader);
  const hasHmac = isNonEmpty(opts.hmacSignatureHeader);

  if (!hasRsa && !hasHmac) {
    return { ok: false, reason: 'missing_signature' };
  }

  if (hasRsa) {
    if (!isNonEmpty(opts.rsaPublicKeyPem)) {
      // RSA header llegó pero no hay public key configurada.
      //
      // GHL manda AMBAS firmas a la vez, así que antes de rendirnos probamos la
      // vía HMAC: su secreto sale del portal del propio dueño de la app, no de
      // una clave pública que haya que ir a buscar por ahí. Sin este fallback,
      // pasar a `enforce` era imposible salvo consiguiendo la PEM, y quedarse en
      // `warn` significa aceptar webhooks sin verificar de nadie.
      //
      // No debilita nada: cuando la PEM está configurada, RSA sigue ganando.
      if (hasHmac && isNonEmpty(opts.hmacSharedSecret)) {
        return verifyHmacSignature({
          rawBody: opts.rawBody,
          signatureHeader: opts.hmacSignatureHeader!,
          sharedSecret: opts.hmacSharedSecret,
          toleranceSeconds: opts.hmacToleranceSeconds ?? 300,
          nowMs: opts.nowMs ?? Date.now(),
        });
      }
      return { ok: false, reason: 'no_secret_configured' };
    }
    const result = verifyGhlSignature({
      rawBody: opts.rawBody,
      signatureHeader: opts.rsaSignatureHeader,
      publicKeyPem: opts.rsaPublicKeyPem!,
    });
    return mapRsaResult(result);
  }

  // HMAC path
  if (!isNonEmpty(opts.hmacSharedSecret)) {
    return { ok: false, reason: 'no_secret_configured' };
  }
  return verifyHmacSignature({
    rawBody: opts.rawBody,
    signatureHeader: opts.hmacSignatureHeader!,
    sharedSecret: opts.hmacSharedSecret!,
    toleranceSeconds: opts.hmacToleranceSeconds ?? 300,
    nowMs: opts.nowMs ?? Date.now(),
  });
}

function mapRsaResult(r: VerifyGhlResult): VerifyMarketplaceResult {
  if (r.ok) return { ok: true, method: 'rsa' };
  return { ok: false, reason: r.reason };
}

function isNonEmpty(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.length > 0;
}

// ---------------------------------------------------------------------------
// HMAC verifier interno
// ---------------------------------------------------------------------------

interface HmacOptions {
  rawBody: Buffer | string;
  signatureHeader: string;
  sharedSecret: string;
  toleranceSeconds: number;
  nowMs: number;
}

function verifyHmacSignature(opts: HmacOptions): VerifyMarketplaceResult {
  // Parsear formato `t=<unix_seconds>,s=<hex>` (similar a YCloud) o solo `<hex>`.
  const parsed = parseHmacHeader(opts.signatureHeader);
  if (!parsed) return { ok: false, reason: 'invalid_hmac_format' };

  const bodyBuf = Buffer.isBuffer(opts.rawBody)
    ? opts.rawBody
    : Buffer.from(opts.rawBody, 'utf8');

  // Si trae timestamp, validar tolerancia anti-replay.
  if (parsed.timestamp != null) {
    const tsMs = parsed.timestamp * 1000;
    if (!Number.isFinite(tsMs)) return { ok: false, reason: 'invalid_timestamp' };
    const driftMs = Math.abs(opts.nowMs - tsMs);
    if (driftMs > opts.toleranceSeconds * 1000) {
      return { ok: false, reason: 'replay_window_exceeded' };
    }
  }

  const signedPayload =
    parsed.timestamp != null
      ? Buffer.concat([Buffer.from(`${parsed.timestamp}.`, 'utf8'), bodyBuf])
      : bodyBuf;

  const computed = createHmac('sha256', opts.sharedSecret).update(signedPayload).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(parsed.signature, 'hex');
  } catch {
    return { ok: false, reason: 'invalid_hmac_format' };
  }
  if (provided.length !== computed.length) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  if (!timingSafeEqual(computed, provided)) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  return { ok: true, method: 'hmac' };
}

interface ParsedHmacHeader {
  timestamp: number | null;
  signature: string;
}

function parseHmacHeader(header: string): ParsedHmacHeader | null {
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;

  // Formato 1: `t=<unix>,s=<hex>` (orden de pares no fijo)
  if (trimmed.includes('=') && trimmed.includes(',')) {
    const parts = trimmed.split(',');
    let t: number | null = null;
    let s: string | null = null;
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq <= 0) continue;
      const key = p.slice(0, eq).trim();
      const value = p.slice(eq + 1).trim();
      if (key === 't') t = Number(value);
      else if (key === 's') s = value;
    }
    if (s && /^[a-fA-F0-9]+$/.test(s)) {
      return { timestamp: t != null && Number.isFinite(t) ? t : null, signature: s };
    }
    return null;
  }

  // Formato 2: hex puro (sin timestamp)
  if (/^[a-fA-F0-9]+$/.test(trimmed)) {
    return { timestamp: null, signature: trimmed };
  }

  return null;
}
