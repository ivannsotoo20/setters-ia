'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'fyzon_setup_seen_v1';

/**
 * Componente client que redirige al wizard de setup la PRIMERA vez que el
 * trainer entra a su dashboard con `onboarded_at IS NULL`. Después de la
 * primera visita, el setup queda accesible desde `Configuración → Setup`
 * en el sidebar (con badge "Pendiente" si aún faltan pasos).
 *
 * Persistencia: localStorage `fyzon_setup_seen_v1`. Si el usuario limpia
 * localStorage o entra en incógnito, vuelve a salir el redirect — aceptable.
 *
 * Solo se renderiza desde `/dashboard` cuando `onboardedAt == null`. Si el
 * tenant ya está onboardeado, este componente NO se monta.
 */
export function FirstVisitRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (seen === '1') return;
      window.localStorage.setItem(STORAGE_KEY, '1');
      router.replace('/settings/setup?firstvisit=1');
    } catch {
      // localStorage puede fallar en algunos contextos (Safari ITP, etc.).
      // En ese caso, no redirigimos — el trainer accederá via sidebar.
    }
  }, [router]);

  return null;
}
