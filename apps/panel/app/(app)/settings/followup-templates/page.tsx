import { getEffectiveTenant } from '@/lib/effective-tenant';
import { listFollowupTemplates } from '@/lib/actions/followups';
import { TemplatesTabs } from '@/components/followup-templates/templates-tabs';

export const dynamic = 'force-dynamic';

export default async function FollowupTemplatesPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return <div className="p-8 text-sm text-muted-foreground">Necesitas estar autenticado.</div>;
  }

  const canEdit =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';

  const result = await listFollowupTemplates();
  const templates = result.ok ? result.data ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Followups</p>
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas por canal</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Las plantillas <strong>WhatsApp</strong> se sincronizan desde YCloud (Meta las aprueba)
          y son obligatorias pasadas las 24h del último mensaje del lead. Las plantillas{' '}
          <strong>Instagram</strong> y <strong>Facebook</strong> son texto libre y soportan
          "personalización con IA" para que el motor genere mensaje contextual al enviar
          (estilo SkaleX).
        </p>
      </div>

      <TemplatesTabs templates={templates} canEdit={canEdit} />
    </div>
  );
}
