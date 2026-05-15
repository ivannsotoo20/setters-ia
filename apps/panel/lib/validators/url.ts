/**
 * URL validators (Hardening 2026-05-15 audit MEDIUM M-4).
 *
 * Centraliza la validación de URLs externas para evitar:
 *   - `javascript:` o `data:` URI smuggling (XSS via href).
 *   - URLs malformadas que crashean al construir.
 *   - http:// en producción (downgrade attack).
 */

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/**
 * Valida que una URL es HTTPS válida. Permite http en localhost para dev.
 * Lanza UrlValidationError si falla.
 */
export function assertHttpsUrl(input: string, context = 'url'): void {
  if (!input || typeof input !== 'string') {
    throw new UrlValidationError(`${context}: vacía o no string`);
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UrlValidationError(`${context}: URL inválida (no parsea)`);
  }
  const isLocalhost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(url.hostname);
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && isLocalhost) return;
  if (url.protocol === 'javascript:' || url.protocol === 'data:' || url.protocol === 'file:') {
    throw new UrlValidationError(
      `${context}: protocol '${url.protocol}' no permitido (posible XSS attempt)`,
    );
  }
  throw new UrlValidationError(`${context}: solo https:// permitido (got ${url.protocol})`);
}

/** Variant que devuelve boolean en lugar de throw. */
export function isValidHttpsUrl(input: string): boolean {
  try {
    assertHttpsUrl(input);
    return true;
  } catch {
    return false;
  }
}
