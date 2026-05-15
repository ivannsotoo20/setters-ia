import type { NextConfig } from 'next';

/**
 * Headers de seguridad globales (Hardening 2026-05-15 audit MEDIUM M-5).
 * - HSTS: fuerza HTTPS por 2 años + preload.
 * - X-Content-Type-Options nosniff: previene MIME sniffing attacks.
 * - X-Frame-Options DENY: anti-clickjacking. Panel NUNCA debe verse en iframe.
 * - Referrer-Policy strict-origin-when-cross-origin: limita info en referer.
 * - Permissions-Policy: deshabilita features sensibles que no usamos.
 *
 * CSP intencionalmente fuera (rompe scripts inline de Next.js + shadcn). Se
 * añadirá en sprint dedicado con report-only mode primero.
 */
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), usb=(), geolocation=(), payment=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fyzon/db', '@fyzon/prompt-composer'],
  experimental: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
