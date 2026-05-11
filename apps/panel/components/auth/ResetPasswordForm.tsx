'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updatePasswordAction, type AuthActionState } from '@/lib/actions/auth';

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    updatePasswordAction,
    {
      status: 'idle',
      message: '',
    },
  );

  useEffect(() => {
    if (state.status === 'success') {
      const t = setTimeout(() => {
        router.push('/login');
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [state.status, router]);

  const success = state.status === 'success';

  return (
    <form action={formAction} className="auth-form">
      <div className="auth-field">
        <label className="auth-label" htmlFor="password">
          Nueva contraseña
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
          disabled={pending || success}
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
          disabled={pending || success}
        />
      </div>

      <button type="submit" className="auth-button" disabled={pending || success}>
        {pending ? 'Guardando…' : success ? 'Listo, redirigiendo…' : 'Cambiar contraseña'}
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
    </form>
  );
}
