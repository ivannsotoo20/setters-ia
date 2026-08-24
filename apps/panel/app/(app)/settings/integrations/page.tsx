import { listIntegrations } from '@/lib/actions/integrations';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { IntegrationsList } from './integrations-list';
import { AddIntegrationDialog } from './add-integration-dialog';
import { IntegrationsTabs } from './integrations-tabs';
import { HealthSection } from './health-section';
import { WhatsAppSection } from './whatsapp-section';
import { InstagramSection } from './instagram-section';
import { AnthropicKeyCard } from './anthropic-key-card';
import { getAnthropicKeyState } from '@/lib/actions/anthropic-key';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const [result, anthropicKey] = await Promise.all([
    listIntegrations(),
    getAnthropicKeyState(),
  ]);
  const integrations = result.ok ? result.data ?? [] : [];

  const listSection = (
    <>
      {anthropicKey.ok ? (
        <AnthropicKeyCard
          initial={anthropicKey.data ?? { hasOwnKey: false, hint: null }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tus integraciones ({integrations.length})
          </CardTitle>
          <CardDescription>
            Conecta tu CRM o BSP de mensajería pegando las credenciales aquí. Las
            credenciales se cifran con AES-256-GCM antes de tocar la BD.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">Error: {result.error}</p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin integraciones todavía. Click en &quot;Añadir integración&quot; para
              empezar.
            </p>
          ) : (
            <IntegrationsList integrations={integrations} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo funciona</CardTitle>
          <CardDescription>BYOK — Bring Your Own Keys</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">1.</strong> Eliges el proveedor (GHL,
            Meta API, YCloud, ManyChat) y pegas tus credenciales.
          </p>
          <p>
            <strong className="text-foreground">2.</strong> El panel hace ping a la
            API del proveedor para validar que funcionan.
          </p>
          <p>
            <strong className="text-foreground">3.</strong> Si OK, se cifran con
            AES-256-GCM y se guardan en la BD. La key de cifrado vive solo en el
            servidor — las credenciales nunca viajan al cliente en claro.
          </p>
          <p>
            <strong className="text-foreground">4.</strong> El motor lee las
            credenciales en runtime cuando llega un webhook o necesita enviar un
            mensaje. Sin reinicio.
          </p>
        </CardContent>
      </Card>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        </div>
        <AddIntegrationDialog />
      </div>

      <IntegrationsTabs
        listSection={listSection}
        instagramSection={<InstagramSection />}
        whatsappSection={<WhatsAppSection />}
        healthSection={<HealthSection />}
      />
    </div>
  );
}
