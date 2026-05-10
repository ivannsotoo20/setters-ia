import { getEffectiveTenant } from '@/lib/effective-tenant';
import { listFollowupTemplates } from '@/lib/actions/followups';
import { TemplatesList } from '@/components/followup-templates/templates-list';
import { FollowupTemplateFormDialog } from '@/components/followup-templates/followup-template-form-dialog';

export const dynamic = 'force-dynamic';

export default async function FollowupTemplatesPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Necesitas estar autenticado.
      </div>
    );
  }

  const canEdit =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';

  const result = await listFollowupTemplates();
  const templates = result.ok ? result.data ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Followups
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas reutilizables</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Define plantillas de followup (recordatorios, seguimientos, mensajes de
            re-engagement). Al programar un followup desde cualquier conversación
            podrás partir de una plantilla y editarla si quieres.
          </p>
        </div>
        {canEdit ? <FollowupTemplateFormDialog mode="create" /> : null}
      </div>

      <TemplatesList templates={templates} canEdit={canEdit} />
    </div>
  );
}
