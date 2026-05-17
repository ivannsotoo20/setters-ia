import type { ReactNode } from 'react';
import { FyzonLogo } from '@/components/branding/fyzon-logo';

/**
 * Shell común para todas las páginas de auth (login, admin/login, forgot,
 * reset, accept-invite). Aplica branding Fyzon (logo servido local) + tarjeta
 * centrada con título/subtítulo + slot de contenido.
 *
 * Variant 'admin' marca visualmente la pantalla como acceso interno.
 */

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
        <div className="auth-logo">
          <FyzonLogo variant="mark" priority className="size-14" />
        </div>
        {badge ? (
          <span className="self-center text-[0.7rem] uppercase tracking-[0.08em] font-semibold text-primary border border-primary/40 px-2.5 py-1 rounded-full">
            {badge}
          </span>
        ) : null}
        <h1 className="auth-title">{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </main>
  );
}
