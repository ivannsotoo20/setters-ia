'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  /** Si false, el polling se desactiva (sin selección o conversación bloqueada). */
  enabled: boolean;
  /** Intervalo en ms. Default 10s. */
  intervalMs?: number;
}

/**
 * Polling ligero del panel chat: cada `intervalMs` invoca `router.refresh()`
 * para re-correr el SSR del segmento activo (`/conversations/[id]` o
 * `/conversations?selected=...`) y traer mensajes nuevos del lead +
 * actualizar contadores de tabs/no leídos.
 *
 * - Solo refresca cuando `document.visibilityState === 'visible'` para
 *   no consumir requests cuando la pestaña está en background.
 * - Polling stop si `enabled=false` (sin selección, conversación cerrada,
 *   o caso futuro donde el usuario decide pausar el auto-refresh).
 *
 * Trade-off: 6 reqs/min de SSR por usuario activo. Aceptable mientras
 * no haya muchos tenants concurrentes. Sustituir por Supabase Realtime
 * cuando el volumen lo justifique (Sprint Mu/posterior).
 */
export function ThreadAutoRefresh({ enabled, intervalMs = 10_000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  return null;
}
