import { redirect } from 'next/navigation';

/**
 * Ruta legacy: `/settings/whatsapp` ahora vive como tab dentro de
 * `/settings/integrations` (Sprint reorganización 2026-05-16). Redirigimos
 * para no romper bookmarks ni links cruzados desde otros sitios del panel.
 */
export default function WhatsappSettingsRedirect() {
  redirect('/settings/integrations?tab=whatsapp');
}
