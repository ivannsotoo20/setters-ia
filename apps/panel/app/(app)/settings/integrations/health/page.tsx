import { redirect } from 'next/navigation';

/**
 * Ruta legacy: `/settings/integrations/health` ahora vive como tab dentro de
 * `/settings/integrations`. Redirigimos para no romper bookmarks / links viejos.
 */
export default function IntegrationsHealthRedirect() {
  redirect('/settings/integrations?tab=health');
}
