import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  verifyGhlSignature,
  verifyGhlEd25519Signature,
  type VerifyGhlResult,
} from './webhook-verify-ghl.js';

/**
 * GHL Marketplace App webhook signature verification (Bloque C.E.3).
 *
 * GHL envía webhooks de apps Marketplace con hasta tres firmas posibles:
 *
 *   - **Ed25519 con public key universal GHL** — header `x-ghl-signature`
 *     con 64 bytes en base64. Es la firma VIGENTE (2026) y la única que
 *     sobrevive al 2026-09-01, cuando GHL retira la RSA. Verificada en
 *     producción: los webhooks reales del tenant 7 llegan con ambos headers.
 *
 *   - **RSA-SHA256 con public key universal GHL** — header `x-wh-signature`
 *     (firma base64). Signed payload = rawBody. Deprecada 2026-09-01.
 *
 *   - **HMAC-SHA256 con Shared Secret** — el formato ANTIGUO del header
 *     `x-ghl-signature` (`t=<unix_seconds>,s=<hmac_hex>` o `<hmac_hex>` raw).
 *     Se conserva por si alguna instalación vieja aún lo emite; se distingue
 *     del Ed25519 sin ambigüedad por la forma del valor (hex/`t=` vs base64
 *     de 64 bytes).
 *
 * Orden de preferencia del verifier:
 *   1. `x-ghl-signature` con pinta de Ed25519 + clave configurada → Ed25519.
 *   2. `x-wh-signature` + PEM RSA configurada → RSA.
 *   3. `x-ghl-signature` formato HMAC + shared secret → HMAC.
 *   4. Nada verificable → `no_secret_configured` / `missing_signature`.
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
  /** Public key PEM Ed25519 de GHL (header x-ghl-signature moderno). Si vacía, no se intenta. */
  ed25519PublicKeyPem?: string;
  /** Shared secret de la app Marketplace (para HMAC). Si vacía, HMAC no se intenta. */
  hmacSharedSecret?: string;
  /** Tolerancia anti-replay en segundos para timestamp HMAC. Default 300s. */
  hmacToleranceSeconds?: number;
  /** Override de `Date.now()` en ms — solo para tests. */
  nowMs?: number;
}

export type VerifyMarketplaceResult =
  | { ok: true; method: 'rsa' | 'hmac' | 'ed25519' }
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
  const hasRsa = isNonEmpty(opts.rsaSignatureHeader);
  const hasHmac = isNonEmpty(opts.hmacSignatureHeader);

  if (!hasRsa && !hasHmac) {
    return { ok: false, reason: 'missing_signature' };
  }

  // 1. Ed25519 primero: es la firma vigente y la única que queda tras el
  //    2026-09-01. Solo si el header tiene la forma de una firma Ed25519
  //    (base64 de 64 bytes) — un header con formato HMAC (`t=…,s=…` o hex)
  //    cae a su propia vía más abajo.
  if (hasHmac && isNonEmpty(opts.ed25519PublicKeyPem) && looksLikeEd25519(opts.hmacSignatureHeader!)) {
    const result = verifyGhlEd25519Signature({
      rawBody: opts.rawBody,
      signatureHeader: opts.hmacSignatureHeader,
      publicKeyPem: opts.ed25519PublicKeyPem!,
    });
    if (result.ok) return { ok: true, method: 'ed25519' };
    // Si la Ed25519 no casa, NO nos rendimos todavía: la RSA del mismo request
    // puede validar (GHL manda ambas). Solo si tampoco hay vía RSA, este es el
    // veredicto final.
    if (!hasRsa || !isNonEmpty(opts.rsaPublicKeyPem)) {
      return mapRsaResult(result);
    }
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

/**
 * Distingue sin ambigüedad el valor moderno de `x-ghl-signature` (Ed25519,
 * base64 de 64 bytes → 88 chars con `==`) del formato HMAC antiguo (`t=…,s=…`
 * o hex puro). Un hex de 64 chars también es base64 válido, pero decodifica a
 * 48 bytes, no a 64 — la longitud decodificada es el discriminador.
 */
function looksLikeEd25519(header: string): boolean {
  const t = header.trim();
  if (t.includes(',')) return false; // `t=…,s=…` → HMAC antiguo
  if (/^[a-fA-F0-9]+$/.test(t)) return false; // hex puro → HMAC antiguo
  if (!/^[A-Za-z0-9+/]+=*$/.test(t)) return false;
  return Buffer.from(t, 'base64').length === 64;
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
