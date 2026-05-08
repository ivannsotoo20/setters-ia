import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyGhlSignature } from '../src/lib/webhook-verify-ghl.js';

let publicKeyPem: string;
let privateKeyPem: string;

beforeAll(() => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKeyPem = publicKey;
  privateKeyPem = privateKey;
});

function signWithPrivateKey(body: string | Buffer): string {
  const signer = createSign('RSA-SHA256');
  signer.update(typeof body === 'string' ? Buffer.from(body, 'utf8') : body);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

describe('verifyGhlSignature', () => {
  it('returns ok=true with valid signature + matching public key', () => {
    const body = JSON.stringify({ type: 'InboundMessage', body: 'hi' });
    const sig = signWithPrivateKey(body);
    const result = verifyGhlSignature({
      rawBody: body,
      signatureHeader: sig,
      publicKeyPem,
    });
    expect(result.ok).toBe(true);
  });

  it('returns missing_signature when header is absent', () => {
    const result = verifyGhlSignature({
      rawBody: 'hi',
      signatureHeader: undefined,
      publicKeyPem,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_signature');
  });

  it('returns invalid_signature_format on non-base64 chars', () => {
    const result = verifyGhlSignature({
      rawBody: 'hi',
      signatureHeader: 'not-base64-!@#$',
      publicKeyPem,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_signature_format');
  });

  it('returns invalid_public_key on malformed PEM', () => {
    const result = verifyGhlSignature({
      rawBody: 'hi',
      signatureHeader: signWithPrivateKey('hi'),
      publicKeyPem: 'NOT A VALID PEM',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_public_key');
  });

  it('returns signature_mismatch when body was tampered', () => {
    const originalBody = JSON.stringify({ a: 1 });
    const sig = signWithPrivateKey(originalBody);
    const tamperedBody = JSON.stringify({ a: 2 });
    const result = verifyGhlSignature({
      rawBody: tamperedBody,
      signatureHeader: sig,
      publicKeyPem,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature_mismatch');
  });

  it('handles Buffer body', () => {
    const body = Buffer.from('hello world', 'utf8');
    const sig = signWithPrivateKey(body);
    const result = verifyGhlSignature({
      rawBody: body,
      signatureHeader: sig,
      publicKeyPem,
    });
    expect(result.ok).toBe(true);
  });

  it('returns signature_mismatch with different key pair', () => {
    const otherKp = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const body = 'hi';
    // Firmar con la clave del otro par, verificar con la nuestra → mismatch
    const otherSigner = createSign('RSA-SHA256');
    otherSigner.update(body);
    otherSigner.end();
    const sig = otherSigner.sign(otherKp.privateKey, 'base64');

    const result = verifyGhlSignature({
      rawBody: body,
      signatureHeader: sig,
      publicKeyPem,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature_mismatch');
  });
});
