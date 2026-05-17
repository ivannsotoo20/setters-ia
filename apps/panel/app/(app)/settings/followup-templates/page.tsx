import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getTenantFollowupConfig } from '@/lib/actions/followup-config';
import { FollowupConfigBlock } from '@/components/followup-templates/followup-config-block';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  enabled: false,
  windowStartHour: 9,
  windowEndHour: 21,
  windowTimezone: 'Europe/Madrid',
  maxFollowupsPerLead: 3,
  intervalsHours: [6, 12, 20],
  autoPersonalize: true,
  defaultFollowupText: 'Hola, ¿pudiste ver mi mensaje? 🙂',
  materializeLookaheadHours: 24,
  followupVoiceExamples: null,
};

/**
 * `/settings/followup-templates` — antes mostraba config de seguimientos +
 * plantillas WhatsApp en la misma vista. Reorganización 2026-05-16: las
 * plantillas WhatsApp se movieron al tab WhatsApp de `/settings/integrations`
 * (conceptualmente son una integración Meta). Aquí queda SOLO la config de
 * seguimientos automáticos (intervalos, ventana 24h, voz, personalización).
 *
 * El sidebar etiqueta esta ruta como "Seguimientos" (la URL legacy se mantiene
 * por compat).
 */
export default async function FollowupTemplatesPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return <div className="p-8 text-sm text-muted-foreground">Necesitas estar autenticado.</div>;
  }

  const canEditConfig = effective.isAgencyAdmin || effective.role === 'owner';

  const cfgResult = await getTenantFollowupConfig();
  const config = cfgResult.ok ? cfgResult.data! : DEFAULT_CONFIG;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Automatización · Seguimientos
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Seguimientos automáticos
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          Configura cuándo y cómo el motor reactiva a leads inactivos. En{' '}
          <strong>Instagram</strong> y <strong>Facebook</strong> los mensajes se
          generan al vuelo con personalización contextual (nombre + últimos
          mensajes). En <strong>WhatsApp</strong> se usan las plantillas
          aprobadas por Meta dentro de la ventana de 24h post último mensaje del
          lead.
        </p>
      </div>

      <FollowupConfigBlock initial={config} canEdit={canEditConfig} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Y las plantillas WhatsApp?</CardTitle>
          <CardDescription>
            Las plantillas Meta aprobadas se gestionan ahora en la sección de
            Integraciones, junto al resto de la configuración WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/integrations?tab=whatsapp"
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Ir a Integraciones · WhatsApp
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
