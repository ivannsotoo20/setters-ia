'use client';

import { useState } from 'react';
import { MessageCircle, Camera, MessageSquare, Sparkles } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FollowupTemplateFormDialog } from './followup-template-form-dialog';
import { DeleteTemplateDialog } from './delete-template-dialog';
import { SyncYCloudButton } from './sync-ycloud-button';
import type { FollowupTemplateRow, ChannelKind } from '@/lib/actions/followups';

interface Props {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
}

const TABS: Array<{ key: ChannelKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'instagram_dm', label: 'Instagram', icon: Camera },
  { key: 'facebook_messenger', label: 'Facebook', icon: MessageSquare },
];

export function TemplatesTabs({ templates, canEdit }: Props) {
  const [active, setActive] = useState<ChannelKind>('whatsapp');

  const byChannel: Record<ChannelKind, FollowupTemplateRow[]> = {
    whatsapp: [],
    instagram_dm: [],
    facebook_messenger: [],
  };
  for (const t of templates) byChannel[t.channelKind].push(t);

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as ChannelKind)} className="flex flex-col gap-3">
      <TabsList>
        {TABS.map(({ key, label, icon: Icon }) => (
          <TabsTrigger key={key} value={key} className="text-xs">
            <Icon className="size-3.5 mr-1" />
            {label}
            <Badge variant="secondary" className="ml-1.5 h-4 text-[9px]">
              {byChannel[key].length}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map(({ key }) => (
        <TabsContent key={key} value={key} className="flex flex-col gap-3">
          <ChannelHeader channelKind={key} canEdit={canEdit} />
          <ChannelGrid templates={byChannel[key]} canEdit={canEdit} channelKind={key} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ChannelHeader({ channelKind, canEdit }: { channelKind: ChannelKind; canEdit: boolean }) {
  const isWA = channelKind === 'whatsapp';
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {isWA
          ? 'Plantillas WhatsApp aprobadas en YCloud/Meta. Pasadas las 24h del último mensaje del lead, son las únicas que se pueden enviar (Meta bloquea texto libre fuera de ventana).'
          : 'Texto libre o "personalización con IA" (motor genera mensaje contextual al enviar usando los últimos mensajes de la conversación + datos del lead).'}
      </p>
      {canEdit ? (
        <div className="flex items-center gap-2 shrink-0">
          {isWA ? (
            <SyncYCloudButton />
          ) : (
            <FollowupTemplateFormDialog
              mode="create"
              channelKind={channelKind as 'instagram_dm' | 'facebook_messenger'}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChannelGrid({
  templates,
  canEdit,
  channelKind,
}: {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
  channelKind: ChannelKind;
}) {
  if (templates.length === 0) {
    const isWA = channelKind === 'whatsapp';
    return (
      <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
        {isWA
          ? canEdit
            ? 'Sin plantillas sincronizadas. Pulsa "Sincronizar YCloud" para importar las plantillas aprobadas en tu cuenta WhatsApp Business.'
            : 'Sin plantillas WhatsApp configuradas.'
          : canEdit
            ? 'Sin plantillas. Pulsa "Nueva plantilla" para crear la primera.'
            : 'Sin plantillas configuradas.'}
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
                <div className="flex items-center gap-1 mt-0.5">
                  {t.provider !== 'manual' ? (
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 text-emerald-500 border-emerald-500/40">
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
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 text-amber-500 border-amber-500/40">
                      <Sparkles className="size-2 mr-0.5" />
                      AI
                    </Badge>
                  ) : null}
                  {t.status !== 'approved' ? (
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 text-rose-500 border-rose-500/40">
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
              <p className="text-[10px] text-amber-500/90 italic line-clamp-3">
                Guía IA: {t.aiGuide}
              </p>
            ) : t.body ? (
              <p className="text-xs text-muted-foreground/90 line-clamp-4 leading-snug whitespace-pre-wrap">
                {t.body}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 italic">Sin cuerpo definido.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
