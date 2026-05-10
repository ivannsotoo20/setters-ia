import Link from 'next/link';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface IntegrationRow {
  id: number;
  provider: string;
  channel_type: string | null;
  via_provider: string | null;
  is_active: boolean;
  last_webhook_at: string | null;
  created_at: string;
}

type HealthStatus = 'green' | 'amber' | 'red';

function deriveStatus(lastWebhookAt: string | null): {
  status: HealthStatus;
  ageHours: number | null;
  label: string;
} {
  if (!lastWebhookAt) {
    return { status: 'red', ageHours: null, label: 'Sin actividad nunca' };
  }
  const age = Date.now() - new Date(lastWebhookAt).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours < 24) {
    return {
      status: 'green',
      ageHours: hours,
      label: `Activo (${formatAge(age)})`,
    };
  }
  if (hours < 24 * 7) {
    return {
      status: 'amber',
      ageHours: hours,
      label: `Sin actividad ${formatAge(age)}`,
    };
  }
  return {
    status: 'red',
    ageHours: hours,
    label: `Inactivo ${formatAge(age)}`,
  };
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'hace unos segundos';
  if (minutes < 60) return `hace ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function statusBadgeClass(status: HealthStatus): string {
  switch (status) {
    case 'green':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40';
    case 'amber':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/40';
    case 'red':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/40';
  }
}

function formatProvider(provider: string): string {
  switch (provider) {
    case 'manychat':
      return 'ManyChat';
    case 'ycloud':
      return 'YCloud';
    case 'ghl':
      return 'GoHighLevel';
    case 'meta_cloud':
      return 'Meta Cloud';
    default:
      return provider;
  }
}

function formatChannel(channelType: string | null): string {
  switch (channelType) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'instagram_dm':
      return 'Instagram';
    case 'facebook_messenger':
      return 'Facebook';
    default:
      return channelType ?? '—';
  }
}

export default async function IntegrationsHealthPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Salud integraciones</h1>
        <p className="text-sm text-destructive mt-3">No autenticado.</p>
      </div>
    );
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('integration_accounts')
    .select(
      'id, provider, channel_id, is_active, last_webhook_at, created_at, channels(channel_type, via_provider)',
    )
    .eq('tenant_id', effective.tenantId)
    .order('id', { ascending: true });

  const rows: IntegrationRow[] = (data ?? []).map((r) => {
    const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
    const channelType = (ch as { channel_type?: string } | null)?.channel_type ?? null;
    const viaProvider = (ch as { via_provider?: string } | null)?.via_provider ?? null;
    return {
      id: Number(r.id),
      provider: String(r.provider),
      channel_type: channelType,
      via_provider: viaProvider,
      is_active: Boolean(r.is_active),
      last_webhook_at: (r.last_webhook_at as string | null) ?? null,
      created_at: String(r.created_at),
    };
  });

  return (
    <div className="max-w-4xl mx-auto py-8 flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Salud de integraciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
            Última vez que cada conector recibió un webhook. 🟢 &lt;24h, 🟠
            24h-7d, 🔴 &gt;7d o nunca. Si una integración está en 🔴 mucho
            tiempo, revisa la automation en el origen.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/integrations" className="gap-1.5">
            Configurar →
          </Link>
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">Error: {error.message}</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin integraciones</CardTitle>
            <CardDescription>
              Aún no has conectado ningún canal. Empieza por el{' '}
              <Link href="/onboarding/integrations" className="underline">
                onboarding
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Proveedor</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Último webhook</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Activa</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const status = deriveStatus(r.last_webhook_at);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium">{formatProvider(r.provider)}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatChannel(r.channel_type)}
                          {r.via_provider && r.via_provider !== r.provider ? (
                            <span className="text-xs text-muted-foreground/70 ml-1">
                              (via {r.via_provider})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                          {r.last_webhook_at
                            ? new Date(r.last_webhook_at).toLocaleString('es-ES')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border ${statusBadgeClass(
                              status.status,
                            )}`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${
                                status.status === 'green'
                                  ? 'bg-emerald-500'
                                  : status.status === 'amber'
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                            />
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.is_active ? (
                            <span className="text-emerald-500 text-xs">Sí</span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              Inactiva
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Una integración en rojo?</CardTitle>
          <CardDescription>Checklist de diagnóstico</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">GHL:</strong> revisa que el
            workflow GHL del trainer está activo y que la URL del webhook step
            apunta al motor Fyzon. Verifica que no se ha rotado el tenant_token.
          </p>
          <p>
            <strong className="text-foreground">YCloud:</strong> verifica que la
            URL de webhook configurada en YCloud panel apunta al motor. Si
            cambias el dominio del motor, hay que actualizar.
          </p>
          <p>
            <strong className="text-foreground">ManyChat:</strong> revisa el
            flow del trainer y que el bloque &quot;External Request&quot; no se
            ha modificado. ManyChat NO firma webhooks — la única auth es el
            tenant_token en URL.
          </p>
          <p className="pt-2">
            <Link
              href="/onboarding/integrations"
              className="text-primary underline inline-flex items-center gap-1"
            >
              <ExternalLink className="size-3.5" />
              Volver al onboarding
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
