import { redirect } from 'next/navigation';

/**
 * /signup desactivado en Hito 10 — modelo invitation-only.
 *
 * Si alguien aterriza aquí, lo enviamos a /login con mensaje.
 * El alta ahora se hace solo por invitación (token en email).
 */
export default function SignupPage() {
  redirect('/login?error=signup_disabled');
}
