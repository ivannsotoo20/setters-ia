import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getWaInboundMode } from '@/lib/actions/wa-inbound-mode';
import { listFollowupTemplates } from '@/lib/actions/followups';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { WaModeForm } from '@/app/(app)/settings/whatsapp/wa-mode-form';
import { TemplatesTabs } from '@/components/followup-templates/templates-tabs';

/**
 * Sección "WhatsApp" dentro de `/settings/integrations`. Antes vivían en dos
 * rutas separadas (`/settings/whatsapp` y plantillas WA dentro de
 * `/settings/followup-templates`); las unificamos aquí porque conceptualmente
 * WhatsApp es una integración con dos sub-temas: política inbound + plantillas
 * de envío fuera de 24h.
 */
export async function WhatsAppSection() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return <p className="text-sm text-destructive">No autenticado.</p>;
  }
  const canEditTemplates =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';

  const [modeResult, tplResult] = await Promise.all([
    getWaInboundMode(),
    listFollowupTemplates(),
  ]);

  const templates = tplResult.ok ? tplResult.data ?? [] : [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Política de apertura inbound</CardTitle>
          <CardDescription>
            Decide cómo se abre la conversación cuando un lead te escribe a
            WhatsApp. Esta política solo aplica al canal WhatsApp vía YCloud.{' '}
            <span className="text-muted-foreground/70">
              Instagram y Facebook van por GHL y se gestionan en{' '}
              <Link href="/keywords" className="underline">
                Keywords
              </Link>
              .
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!modeResult.ok ? (
            <p className="text-sm text-destructive">Error: {modeResult.error}</p>
          ) : (
            <>
              <WaModeForm
                currentMode={modeResult.data!.mode}
                waOpenKeywordCount={modeResult.data!.waOpenKeywordCount}
              />
              {modeResult.data!.mode === 'keyword' &&
              modeResult.data!.waOpenKeywordCount === 0 ? (
                <div className="mt-4 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm">
                  <p className="font-medium text-warning">
                    ⚠️ Sin keywords WA configuradas
                  </p>
                  <p className="mt-1 text-warning/90 text-xs">
                    Estás en modo <code className="font-mono">keyword</code> pero no
                    tienes keywords <code className="font-mono">wa_open</code>{' '}
                    activas. Todos los mensajes WA inbound de leads frescos quedarán
                    silenciados.
                  </p>
                  <Link
                    href="/keywords"
                    className="mt-2 inline-flex items-center gap-1 text-warning underline text-xs"
                  >
                    Configurar keywords
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plantillas WhatsApp</CardTitle>
          <CardDescription>
            Plantillas aprobadas por Meta sincronizadas desde YCloud. Únicas
            mensajes que se pueden enviar a un lead pasadas las 24h desde su
            último mensaje (ventana de WhatsApp Business).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplatesTabs templates={templates} canEdit={canEditTemplates} />
        </CardContent>
      </Card>
    </>
  );
}
