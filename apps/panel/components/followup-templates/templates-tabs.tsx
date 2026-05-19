'use client';

import Link from 'next/link';
import { MessageCircle, Sparkles, Plug, ExternalLink, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FollowupTemplateFormDialog } from './followup-template-form-dialog';
import { DeleteTemplateDialog } from './delete-template-dialog';
import { SyncYCloudButton } from './sync-ycloud-button';
import type { FollowupTemplateRow } from '@/lib/actions/followups';

/**
 * Sprint Iota.5 PR-C — provider WA conectado para el tenant. Determina qué
 * botón de sync se muestra (o el CTA "Conecta WhatsApp primero" cuando es
 * `null`).
 */
export type WaProvider = 'ycloud' | 'ghl' | 'meta_cloud' | null;

interface Props {
  templates: FollowupTemplateRow[];
  canEdit: boolean;
  /** Provider WA activo. Si null, no hay BSP WA conectado. */
  waProvider?: WaProvider;
}

/**
 * Sprint Iota.1.d — Solo WhatsApp. Instagram y Facebook NO usan plantillas:
 * su followup es texto libre generado al vuelo con personalización contextual
 * (Haiku 4.5).
 *
 * Sprint Iota.5 PR-C — el botón de sync depende del provider WA conectado:
 *   - `ycloud` → SyncYCloudButton (funcional).
 *   - `meta_cloud` → botón disabled (aparcado a Iota.6 cuando Iván sea BSP).
 *   - `ghl` → CTA hacia GHL (las plantillas se gestionan en su panel + smoke
 *     pendiente para validar envío via API GHL).
 *   - `null` → mensaje + CTA "Conectar WhatsApp primero" hacia /settings/integrations.
 */
export function TemplatesTabs({ templates, canEdit, waProvider = null }: Props) {
  const whatsappTemplates = templates.filter((t) => t.channelKind === 'whatsapp');

  // Sin WA conectado: CTA explícito al trainer para que conecte primero.
  if (!waProvider) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plug className="size-4" />
          Conecta WhatsApp primero
        </div>
        <p className="text-sm text-muted-foreground max-w-prose">
          Para gestionar plantillas Meta aprobadas, primero tienes que conectar
          un proveedor WhatsApp en Integraciones. Puedes elegir entre{' '}
          <strong>YCloud</strong> (BSP oficial Meta — flujo recomendado),{' '}
          <strong>GoHighLevel</strong> (si ya tienes WhatsApp conectado vía LC
          Phone) o <strong>Meta Cloud directo</strong> (requiere App Review
          Meta).
        </p>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/settings/integrations">
            Conectar WhatsApp
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="size-4 text-success shrink-0" />
          <span className="text-sm font-semibold">WhatsApp</span>
          <Badge variant="outline" className="h-4 text-[9px] uppercase font-mono">
            via {waProvider === 'meta_cloud' ? 'Meta Cloud' : waProvider}
          </Badge>
          <Badge variant="secondary" className="h-4 text-[9px]">
            {whatsappTemplates.length}
          </Badge>
        </div>
        {canEdit ? <SyncButtonForProvider provider={waProvider} /> : null}
      </div>

      <ProviderExplanationBanner provider={waProvider} />

      <ChannelGrid templates={whatsappTemplates} canEdit={canEdit} />
    </div>
  );
}

function SyncButtonForProvider({ provider }: { provider: WaProvider }) {
  if (provider === 'ycloud') {
    return <SyncYCloudButton />;
  }
  if (provider === 'meta_cloud') {
    return (
      <Button variant="outline" size="sm" disabled title="Disponible cuando Iván sea BSP Meta (Iota.6)">
        Sincronizar Meta Cloud
      </Button>
    );
  }
  if (provider === 'ghl') {
    return (
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <a
          href="https://app.gohighlevel.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="size-3.5" />
          Plantillas en GoHighLevel
        </a>
      </Button>
    );
  }
  return null;
}

function ProviderExplanationBanner({ provider }: { provider: WaProvider }) {
  if (provider === 'ycloud') {
    return (
      <p className="text-[11px] text-muted-foreground -mt-1">
        Plantillas WhatsApp aprobadas en YCloud/Meta. Pasadas las 24h del último
        mensaje del lead, son las únicas que se pueden enviar (Meta bloquea
        texto libre fuera de ventana).
      </p>
    );
  }
  if (provider === 'meta_cloud') {
    return (
      <p className="text-[11px] text-muted-foreground -mt-1">
        Plantillas WhatsApp aprobadas vía Cloud API directa. Botón sync
        disponible cuando Iván sea BSP Meta (Iota.6).
      </p>
    );
  }
  if (provider === 'ghl') {
    return (
      <div className="text-[11px] text-muted-foreground -mt-1 flex items-start gap-1.5 rounded-md border border-warning/20 bg-warning/5 p-2">
        <Info className="size-3.5 text-warning shrink-0 mt-0.5" />
        <span>
          GoHighLevel gestiona sus plantillas WA en su propio panel. El envío
          via API GHL es <strong>experimental</strong> (validación empírica en
          curso). Mientras tanto, edita y aprueba plantillas en GHL.
        </span>
      </div>
    );
  }
  return null;
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
