'use client';

import { MessageCircle, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FollowupTemplateFormDialog } from './followup-template-form-dialog';
import { DeleteTemplateDialog } from './delete-template-dialog';
import { SyncYCloudButton } from './sync-ycloud-button';
import type { FollowupTemplateRow } from '@/lib/actions/followups';

interface Props {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
}

/**
 * Sprint Iota.1.d — Solo WhatsApp.
 *
 * Instagram y Facebook NO usan plantillas. Su followup es texto libre
 * generado al vuelo con personalización contextual (Haiku 4.5) usando el
 * `default_followup_text` del tenant + el nombre del lead + los últimos
 * mensajes de la conversación. Toda esa configuración vive en el bloque
 * "Configuración global de seguimientos" justo encima de este componente.
 */
export function TemplatesTabs({ templates, canEdit }: Props) {
  const whatsappTemplates = templates.filter((t) => t.channelKind === 'whatsapp');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="size-4 text-success shrink-0" />
          <span className="text-sm font-semibold">WhatsApp</span>
          <Badge variant="secondary" className="h-4 text-[9px]">
            {whatsappTemplates.length}
          </Badge>
        </div>
        {canEdit ? <SyncYCloudButton /> : null}
      </div>

      <p className="text-[11px] text-muted-foreground -mt-1">
        Plantillas WhatsApp aprobadas en YCloud/Meta. Pasadas las 24h del último
        mensaje del lead, son las únicas que se pueden enviar (Meta bloquea texto
        libre fuera de ventana).
      </p>

      <ChannelGrid templates={whatsappTemplates} canEdit={canEdit} />
    </div>
  );
}

function ChannelGrid({
  templates,
  canEdit,
}: {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
        {canEdit
          ? 'Sin plantillas sincronizadas. Pulsa "Sincronizar YCloud" para importar las plantillas aprobadas en tu cuenta WhatsApp Business.'
          : 'Sin plantillas WhatsApp configuradas.'}
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
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {t.provider !== 'manual' ? (
                    <Badge
                      variant="outline"
                      className="h-3.5 text-[8px] px-1 text-success border-success/40"
                    >
                      {t.provider}
                    </Badge>
                  ) : null}
                  {t.language ? (
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-mono">
                      {t.language}
                    </Badge>
                  ) : null}
                  {t.category ? (
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 font-normal">
                      {t.category}
                    </Badge>
                  ) : null}
                  {t.aiPersonalize ? (
                    <Badge
                      variant="outline"
                      className="h-3.5 text-[8px] px-1 text-warning border-warning/40"
                    >
                      <Sparkles className="size-2 mr-0.5" />
                      AI
                    </Badge>
                  ) : null}
                  {t.status !== 'approved' ? (
                    <Badge
                      variant="outline"
                      className="h-3.5 text-[8px] px-1 text-destructive border-destructive/40"
                    >
                      {t.status}
                    </Badge>
                  ) : null}
                </div>
                {t.description ? (
                  <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {t.description}
                  </span>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex items-center gap-0.5 shrink-0">
                  <FollowupTemplateFormDialog mode="edit" template={t} />
                  <DeleteTemplateDialog
                    templateId={t.id}
                    templateName={t.name}
                    isYCloud={t.provider === 'ycloud' || t.provider === 'meta_cloud'}
                  />
                </div>
              ) : null}
            </div>
            {t.aiPersonalize ? (
              <p className="text-[10px] text-warning/90 italic line-clamp-3">
                Guía IA: {t.aiGuide}
              </p>
            ) : t.body ? (
              <p className="text-xs text-muted-foreground/90 line-clamp-4 leading-snug whitespace-pre-wrap">
                {t.body}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 italic">
                Sin cuerpo definido.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
