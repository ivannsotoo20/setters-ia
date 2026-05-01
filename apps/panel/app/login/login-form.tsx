'use client';

import { useActionState } from 'react';
import { sendMagicLink } from '@/lib/actions/auth';

interface LoginFormProps {
  next: string;
  intent: 'login' | 'signup';
}

export function LoginForm({ next, intent }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(sendMagicLink, {
    status: 'idle' as const,
    message: '',
  });

  const ctaLabel = intent === 'signup' ? 'Crear cuenta' : 'Entrar';
  const sendingLabel = pending ? 'Enviando…' : ctaLabel;

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="intent" value={intent} />

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
        disabled={pending || state.status === 'sent'}
      />

      <button type="submit" className="auth-button" disabled={pending || state.status === 'sent'}>
        {sendingLabel}
      </button>

      {state.status === 'sent' && (
        <p className="auth-message auth-message--ok" role="status">
          {state.message}
        </p>
      )}
      {state.status === 'error' && (
        <p className="auth-message auth-message--error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
