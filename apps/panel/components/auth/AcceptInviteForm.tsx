'use client';

import { useActionState } from 'react';
import { acceptInviteAction } from '@/lib/actions/invites';

interface AcceptInviteFormProps {
  token: string;
  email: string;
  fullNameHint: string;
  /** "Owner del tenant" / "Admin Fyzon" / ... — label legible para el preview. */
  roleLabel: string;
  contextLabel: string;
}

export function AcceptInviteForm({
  token,
  email,
  fullNameHint,
  roleLabel,
  contextLabel,
}: AcceptInviteFormProps) {
  const [state, formAction, pending] = useActionState<
    { status: 'idle' | 'error'; message: string },
    FormData
  >(acceptInviteAction, {
    status: 'idle',
    message: '',
  });

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="token" value={token} />

      <div
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: '0.5rem',
          padding: '0.875rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-muted-foreground)', letterSpacing: '0.01em' }}>
          Invitación a <strong style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{contextLabel}</strong>
        </p>
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-foreground)' }}>{email}</p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-accent)', fontWeight: 500 }}>
          Rol: {roleLabel}
        </p>
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="full_name">
          Nombre completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          defaultValue={fullNameHint}
          placeholder="Tu nombre y apellidos"
          className="auth-input"
          disabled={pending}
        />
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="password">
          Crea tu contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="Mínimo 10 caracteres"
          className="auth-input"
          disabled={pending}
        />
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="password_confirm">
          Repite la contraseña
        </label>
        <input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="Mínimo 10 caracteres"
          className="auth-input"
          disabled={pending}
        />
      </div>

      <button type="submit" className="auth-button" disabled={pending}>
        {pending ? 'Activando cuenta…' : 'Activar mi cuenta'}
      </button>

      {state.status === 'error' && (
        <p className="auth-message auth-message--error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
