import { Card, CardContent } from '@/components/ui/card';
import { FollowupTemplateFormDialog } from './followup-template-form-dialog';
import { DeleteTemplateDialog } from './delete-template-dialog';
import type { FollowupTemplateRow } from '@/lib/actions/followups';

interface Props {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
}

export function TemplatesList({ templates, canEdit }: Props) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
        Sin plantillas. {canEdit ? 'Crea la primera con el botón de arriba.' : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {templates.map((t) => (
        <Card key={t.id} className="bg-muted/20 border-border/50">
          <CardContent className="p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-semibold truncate">{t.name}</span>
                {t.description ? (
                  <span className="text-[10px] text-muted-foreground truncate">
                    {t.description}
                  </span>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex items-center gap-0.5 shrink-0">
                  <FollowupTemplateFormDialog mode="edit" template={t} />
                  <DeleteTemplateDialog templateId={t.id} templateName={t.name} />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground/90 line-clamp-4 leading-snug whitespace-pre-wrap">
              {t.body}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
