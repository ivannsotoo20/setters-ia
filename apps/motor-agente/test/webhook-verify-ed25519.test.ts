import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { verifyGhlEd25519Signature } from '../src/lib/webhook-verify-ghl.js';
import { verifyMarketplaceWebhook } from '../src/lib/webhook-verify-marketplace.js';

/**
 * Ed25519 para `x-ghl-signature` (2026-08-25).
 *
 * GHL retira la firma RSA de `x-wh-signature` el 2026-09-01: a partir de ahí
 * la única verificación posible es esta. El test genera su propio par de
 * claves y firma como firmaría GHL (Ed25519 sobre el body crudo, firma en
 * base64 de 64 bytes).
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signBody(body: string): string {
  return cryptoSign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64');
}

const BODY = JSON.stringify({ type: 'InboundMessage', body: 'hola', locationId: 'loc1' });

describe('verifyGhlEd25519Signature', () => {
  it('acepta una firma válida', () => {
    const r = verifyGhlEd25519Signature({
      rawBody: BODY,
      signatureHeader: signBody(BODY),
      publicKeyPem: PUB_PEM,
    });
    expect(r).toEqual({ ok: true });
  });

  it('rechaza la firma de OTRO body (mismo formato, contenido manipulado)', () => {
    const r = verifyGhlEd25519Signature({
      rawBody: BODY.replace('hola', 'quiero tu dinero'),
      signatureHeader: signBody(BODY),
      publicKeyPem: PUB_PEM,
    });
    expect(r).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rechaza header ausente o vacío', () => {
    expect(
      verifyGhlEd25519Signature({ rawBody: BODY, signatureHeader: undefined, publicKeyPem: PUB_PEM }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
    expect(
      verifyGhlEd25519Signature({ rawBody: BODY, signatureHeader: '  ', publicKeyPem: PUB_PEM }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('rechaza un valor que no es una firma Ed25519 (hex HMAC de 64 chars)', () => {
    const r = verifyGhlEd25519Signature({
      rawBody: BODY,
      signatureHeader: 'a'.repeat(64),
      publicKeyPem: PUB_PEM,
    });
    expect(r).toEqual({ ok: false, reason: 'invalid_signature_format' });
  });

  it('rechaza PEM roto sin lanzar', () => {
    const r = verifyGhlEd25519Signature({
      rawBody: BODY,
      signatureHeader: signBody(BODY),
      publicKeyPem: 'no soy un pem',
    });
    expect(r).toEqual({ ok: false, reason: 'invalid_public_key' });
  });
});

describe('verifyMarketplaceWebhook — enrutado Ed25519', () => {
  it('prefiere Ed25519 cuando el header tiene su forma y hay clave', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: BODY,
      hmacSignatureHeader: signBody(BODY),
      ed25519PublicKeyPem: PUB_PEM,
    });
    expect(r).toEqual({ ok: true, method: 'ed25519' });
  });

  it('escenario post-2026-09-01: solo x-ghl-signature, sin RSA — verifica igual', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: BODY,
      rsaSignatureHeader: undefined,
      hmacSignatureHeader: signBody(BODY),
      ed25519PublicKeyPem: PUB_PEM,
      rsaPublicKeyPem: '-----BEGIN PUBLIC KEY-----\nirrelevante\n-----END PUBLIC KEY-----',
    });
    expect(r).toEqual({ ok: true, method: 'ed25519' });
  });

  it('Ed25519 inválida sin vía RSA disponible → veredicto negativo, no silencio', () => {
    const otro = generateKeyPairSync('ed25519');
    const r = verifyMarketplaceWebhook({
      rawBody: BODY,
      hmacSignatureHeader: cryptoSign(null, Buffer.from(BODY), otro.privateKey).toString('base64'),
      ed25519PublicKeyPem: PUB_PEM,
    });
    expect(r.ok).toBe(false);
  });

  it('header con formato HMAC antiguo NO entra por la vía Ed25519', () => {
    // `t=...,s=<hex>` — debe ir al verificador HMAC (aquí falla por secret ausente,
    // pero lo que importa es la razón: no es un problema de Ed25519).
    const r = verifyMarketplaceWebhook({
      rawBody: BODY,
      hmacSignatureHeader: 't=1700000000,s=' + 'ab'.repeat(32),
      ed25519PublicKeyPem: PUB_PEM,
    });
    expect(r).toEqual({ ok: false, reason: 'no_secret_configured' });
  });
});
