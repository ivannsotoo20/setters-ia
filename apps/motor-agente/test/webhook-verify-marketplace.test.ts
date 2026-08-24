import { createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyMarketplaceWebhook } from '../src/lib/webhook-verify-marketplace.js';

const SHARED_SECRET = 'super-secret-shared-key-1234';

function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function generateRsaKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function signRsa(privateKey: string, payload: string | Buffer): string {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  return cryptoSign('RSA-SHA256', buf, privateKey).toString('base64');
}

describe('verifyMarketplaceWebhook — missing inputs', () => {
  it('returns missing_signature when no headers present', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: '{}',
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing_signature');
  });

  it('returns no_secret_configured when only RSA header but no public key', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: '{}',
      rsaSignatureHeader: 'AAAA',
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_secret_configured');
  });

  it('returns no_secret_configured when only HMAC header but no shared secret', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: '{}',
      hmacSignatureHeader: 'abcdef0123',
      hmacSharedSecret: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_secret_configured');
  });
});

describe('verifyMarketplaceWebhook — HMAC path', () => {
  const body = '{"type":"InboundMessage","contactId":"c1"}';

  it('verifies hex-only HMAC signature', () => {
    const sig = hmacHex(SHARED_SECRET, body);
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      hmacSignatureHeader: sig,
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.method).toBe('hmac');
  });

  it('verifies HMAC with timestamp t=...,s=... format', () => {
    const ts = Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${body}`;
    const sig = hmacHex(SHARED_SECRET, signedPayload);
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      hmacSignatureHeader: `t=${ts},s=${sig}`,
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects HMAC with wrong secret (signature_mismatch)', () => {
    const sig = hmacHex('wrong-secret', body);
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      hmacSignatureHeader: sig,
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signature_mismatch');
  });

  it('rejects HMAC with replay window exceeded (timestamp old)', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 1000; // 1000s atrás
    const signedPayload = `${oldTs}.${body}`;
    const sig = hmacHex(SHARED_SECRET, signedPayload);
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      hmacSignatureHeader: `t=${oldTs},s=${sig}`,
      hmacSharedSecret: SHARED_SECRET,
      hmacToleranceSeconds: 300,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('replay_window_exceeded');
  });

  it('rejects HMAC with malformed header (no hex)', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      hmacSignatureHeader: 'not-hex-not-pairs!!',
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_hmac_format');
  });
});

describe('verifyMarketplaceWebhook — RSA path', () => {
  const body = '{"type":"OutboundMessage","contactId":"c1"}';
  const { publicKey, privateKey } = generateRsaKeypair();

  it('verifies valid RSA signature', () => {
    const sig = signRsa(privateKey, body);
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      rsaSignatureHeader: sig,
      rsaPublicKeyPem: publicKey,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.method).toBe('rsa');
  });

  it('rejects RSA with tampered body (signature_mismatch)', () => {
    const sig = signRsa(privateKey, body);
    const r = verifyMarketplaceWebhook({
      rawBody: body + 'x',
      rsaSignatureHeader: sig,
      rsaPublicKeyPem: publicKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signature_mismatch');
  });

  it('prefers RSA when both RSA and HMAC headers present', () => {
    const sig = signRsa(privateKey, body);
    // HMAC header llega pero está mal — si tomáramos HMAC, fallaría. Probamos
    // que el verifier elige RSA correctamente.
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      rsaSignatureHeader: sig,
      hmacSignatureHeader: 'abc123',
      rsaPublicKeyPem: publicKey,
      hmacSharedSecret: SHARED_SECRET,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.method).toBe('rsa');
  });
});

describe('fallback a HMAC cuando llega RSA pero no hay public key', () => {
  // GHL manda las dos firmas a la vez. Sin este fallback, un tenant sin la PEM
  // de GHL no podia pasar a `enforce` y se quedaba aceptando webhooks sin
  // verificar de nadie. El secreto HMAC sale del portal del dueno de la app.
  const secret = 'sh4r3d-s3cr3t-de-la-app';
  const body = JSON.stringify({ type: 'InboundMessage', locationId: 'abc' });
  const hmac = createHmac('sha256', secret).update(body).digest('hex');

  it('verifica por HMAC si hay secreto y no hay PEM', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      rsaSignatureHeader: 'firma-rsa-que-no-podemos-comprobar',
      hmacSignatureHeader: hmac,
      rsaPublicKeyPem: '',
      hmacSharedSecret: secret,
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.method).toBe('hmac');
  });

  it('rechaza si el HMAC no cuadra, aunque venga firma RSA', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      rsaSignatureHeader: 'firma-rsa',
      hmacSignatureHeader: createHmac('sha256', 'otro-secreto').update(body).digest('hex'),
      rsaPublicKeyPem: '',
      hmacSharedSecret: secret,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('signature_mismatch');
  });

  it('sigue devolviendo no_secret_configured si tampoco hay secreto HMAC', () => {
    const r = verifyMarketplaceWebhook({
      rawBody: body,
      rsaSignatureHeader: 'firma-rsa',
      rsaPublicKeyPem: '',
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('no_secret_configured');
  });
});
