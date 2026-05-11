import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Shell común para todas las páginas de auth (login, admin/login, forgot,
 * reset, accept-invite). Aplica branding Fyzon (logo CDN canónico) + tarjeta
 * centrada con título/subtítulo + slot de contenido.
 *
 * Variant 'admin' marca visualmente la pantalla como acceso interno.
 */

const FYZON_LOGO_URL =
  'https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png';

interface AuthShellProps {
  variant?: 'default' | 'admin';
  title: string;
  subtitle?: string;
  /** Badge pequeña sobre el título (ej. "Acceso interno"). */
  badge?: string;
  children: ReactNode;
  /** Footer secundario opcional debajo del form (links). */
  footer?: ReactNode;
}

export function AuthShell({
  variant = 'default',
  title,
  subtitle,
  badge,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className={`auth-shell ${variant === 'admin' ? 'auth-shell--admin' : ''}`}>
      <div className="auth-card">
        <div className="flex justify-center mb-2">
          <Image
            src={FYZON_LOGO_URL}
            alt="Fyzon"
            width={120}
            height={38}
            style={{ height: '38px', width: 'auto' }}
            priority
            unoptimized
          />
        </div>
        {badge ? (
          <span
            style={{
              alignSelf: 'center',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              padding: '0.25rem 0.625rem',
              borderRadius: 9999,
              fontWeight: 600,
            }}
          >
            {badge}
          </span>
        ) : null}
        <h1 className="auth-title text-center">{title}</h1>
        {subtitle ? <p className="auth-subtitle text-center">{subtitle}</p> : null}
        {children}
        {footer ? (
          <div className="auth-footer" style={{ textAlign: 'center' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
