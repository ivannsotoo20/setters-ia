import { redirect } from 'next/navigation';

/**
 * Deprecated (Hito 12.1, 2026-05-18): la ruta `/onboarding/integrations` se
 * sustituyó por `/settings/setup` (sección dentro de Configuración). Esta página
 * redirige permanente para no romper links externos / emails de bienvenida que
 * apunten al wizard antiguo.
 *
 * Lógica de la primera visita ahora vive en `dashboard/page.tsx` →
 * `<FirstVisitRedirect />` (localStorage flag).
 */
export default function OnboardingIntegrationsRedirect() {
  redirect('/settings/setup');
}
