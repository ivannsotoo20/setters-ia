import { getEffectiveTenant } from '@/lib/effective-tenant';
import { listFollowupTemplates } from '@/lib/actions/followups';
import { getTenantFollowupConfig } from '@/lib/actions/followup-config';
import { TemplatesTabs } from '@/components/followup-templates/templates-tabs';
import { FollowupConfigBlock } from '@/components/followup-templates/followup-config-block';
import { Separator } from '@/components/ui/separator';

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
};

export default async function FollowupTemplatesPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return <div className="p-8 text-sm text-muted-foreground">Necesitas estar autenticado.</div>;
  }

  const canEditTemplates =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';
  const canEditConfig = effective.isAgencyAdmin || effective.role === 'owner';

  const [tplResult, cfgResult] = await Promise.all([
    listFollowupTemplates(),
    getTenantFollowupConfig(),
  ]);
  const templates = tplResult.ok ? tplResult.data ?? [] : [];
  const config = cfgResult.ok ? cfgResult.data! : DEFAULT_CONFIG;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Followups</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Seguimientos automáticos y plantillas
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Configura cuándo y cómo el motor envía seguimientos a leads inactivos. Las
          plantillas <strong>WhatsApp</strong> se sincronizan desde YCloud (aprobadas
          por Meta). Las plantillas <strong>Instagram</strong> y{' '}
          <strong>Facebook</strong> se generan al vuelo con personalización contextual.
        </p>
      </div>

      <FollowupConfigBlock initial={config} canEdit={canEditConfig} />

      <Separator />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-tight uppercase tracking-wide text-muted-foreground">
          Plantillas por canal
        </h2>
        <TemplatesTabs templates={templates} canEdit={canEditTemplates} />
      </div>
    </div>
  );
}
