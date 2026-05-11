'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction, type AuthActionState } from '@/lib/actions/auth';

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    requestPasswordResetAction,
    {
      status: 'idle',
      message: '',
    },
  );

  const submitted = state.status === 'success';

  return (
    <form action={formAction} className="auth-form">
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
          disabled={pending || submitted}
        />
      </div>

      <button type="submit" className="auth-button" disabled={pending || submitted}>
        {pending ? 'Enviando…' : submitted ? 'Enlace enviado' : 'Enviar enlace'}
      </button>

      {state.status === 'success' && (
        <p className="auth-message auth-message--ok" role="status">
          {state.message}
        </p>
      )}
      {state.status === 'error' && (
        <p className="auth-message auth-message--error" role="alert">
          {state.message}
        </p>
      )}

      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--color-muted-foreground)',
          margin: 0,
          paddingTop: '0.85rem',
          borderTop: '1px solid var(--color-border)',
          textAlign: 'center',
        }}
      >
        <Link href="/login" style={{ color: 'var(--color-accent)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
