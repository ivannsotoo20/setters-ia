'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInWithPasswordAction, type AuthActionState } from '@/lib/actions/auth';

interface PasswordLoginFormProps {
  next: string;
  /** Si true, NO mostramos el link "¿No tienes cuenta? Pega tu invitación" — admin login. */
  hideInviteHint?: boolean;
}

export function PasswordLoginForm({ next, hideInviteHint = false }: PasswordLoginFormProps) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    signInWithPasswordAction,
    {
      status: 'idle',
      message: '',
    },
  );

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="next" value={next} />

      <div className="auth-field">
        <label className="auth-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
          className="auth-input"
          disabled={pending}
        />
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-label" htmlFor="password">
            Contraseña
          </label>
          <Link href="/forgot-password" className="auth-link-muted">
            ¿Olvidaste la contraseña?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={1}
          placeholder="••••••••"
          className="auth-input"
          disabled={pending}
        />
      </div>

      <button type="submit" className="auth-button" disabled={pending}>
        {pending ? 'Entrando…' : 'Iniciar sesión'}
      </button>

      {state.status === 'error' && (
        <p className="auth-message auth-message--error" role="alert">
          {state.message}
        </p>
      )}

      {!hideInviteHint && (
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--color-muted-foreground)',
            margin: 0,
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--color-border)',
            textAlign: 'center',
            lineHeight: 1.45,
          }}
        >
          ¿Tienes invitación? Abre el enlace que recibiste por email.
        </p>
      )}
    </form>
  );
}
