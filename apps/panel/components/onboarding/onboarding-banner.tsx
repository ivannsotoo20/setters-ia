'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Banner persistente arriba del shell del panel cuando el tenant efectivo
 * tiene `onboarded_at IS NULL`. Se muestra en TODAS las rutas trainer (no en
 * `/admin/*` — esas son shell agencia).
 *
 * Dos copies según el modo:
 *   - 'trainer': el propio trainer en su panel ("Termina el setup…").
 *   - 'admin_impersonating': agency admin viendo el panel del trainer bajo
 *     impersonate (texto adaptado para evitar confusión).
 */
export function OnboardingBanner({
  mode,
  coachIsPlaceholder,
}: {
  mode: 'trainer' | 'admin_impersonating';
  /** Si true, añade aviso extra: el coach v3 sigue vacío. */
  coachIsPlaceholder: boolean;
}) {
  const pathname = usePathname();
  // No mostrar dentro de admin shell.
  if (pathname?.startsWith('/admin/')) return null;
  // No mostrar dentro del propio wizard (sería redundante).
  if (pathname?.startsWith('/onboarding')) return null;

  return (
    <div
      className={cn(
        'border-b px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm',
        'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <AlertTriangle className="size-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        {mode === 'trainer' ? (
          <p>
            <strong className="text-foreground">Estás en modo configuración.</strong>{' '}
            <span className="text-muted-foreground">
              Termina el setup para empezar a recibir leads automáticamente.
            </span>
          </p>
        ) : (
          <p>
            <strong className="text-foreground">Este tenant aún no ha terminado el onboarding.</strong>{' '}
            <span className="text-muted-foreground">
              Cuando el trainer complete el wizard, el banner desaparecerá.
            </span>
          </p>
        )}
        {coachIsPlaceholder ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Recordatorio interno: el coach v3 sigue siendo el placeholder vacío.
          </p>
        ) : null}
      </div>
      <Link
        href="/onboarding/integrations"
        className="text-sm font-medium text-amber-300 hover:underline inline-flex items-center gap-1 shrink-0"
      >
        {mode === 'trainer' ? 'Continuar setup' : 'Ver wizard'}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
