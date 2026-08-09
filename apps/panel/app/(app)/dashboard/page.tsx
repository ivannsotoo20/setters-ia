import { loadDashboardData, type ChannelFilter } from '@/lib/actions/dashboard';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getTenantHealth } from '@/lib/tenant-health';
import { FirstVisitRedirect } from '@/components/onboarding/first-visit-redirect';
import { getAiEnabled } from '@/lib/actions/ai-switch';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    w?: string;
    ch?: string;
    from?: string;
    to?: string;
  }>;
}

function parseChannelKey(value: string | null | undefined): ChannelFilter {
  if (value === 'wa' || value === 'fb' || value === 'ig-in' || value === 'ig-out') return value;
  return 'all';
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Cargas en paralelo. tenantHealth se usa SOLO para decidir si renderizar
  // <FirstVisitRedirect /> (auto-redirect a /settings/setup la primera vez).
  // El dashboard normal NO se bloquea: widgets + tendencia se muestran siempre.
  const effective = await getEffectiveTenant();
  const [result, tenantHealth, aiEnabled] = await Promise.all([
    loadDashboardData({
      windowKey: sp.w ?? null,
      channelKey: parseChannelKey(sp.ch),
      customFrom: sp.from ?? null,
      customTo: sp.to ?? null,
    }),
    effective ? getTenantHealth(effective.tenantId) : Promise.resolve(null),
    getAiEnabled(),
  ]);

  if (!result.ok) {
    return (
      <div className="p-8 text-sm text-destructive">
        Error cargando dashboard: {result.error}
      </div>
    );
  }

  const isOnboardingPending = tenantHealth != null && tenantHealth.onboardedAt == null;

  return (
    <>
      {isOnboardingPending ? <FirstVisitRedirect /> : null}
      {/* Un interruptor que se te olvida que apagaste es una averia silenciosa.
          Mientras el setter este parado, se dice aqui y en cada carga. */}
      {!aiEnabled ? (
        <div className="mb-4 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Tu asistente está parado</p>
          <p className="text-muted-foreground mt-0.5">
            No está contestando a nadie. Sigues recibiendo todos los mensajes y puedes
            responder tú desde Conversaciones.{' '}
            <Link href="/settings/preferences" className="underline font-medium">
              Volver a activarlo
            </Link>
          </p>
        </div>
      ) : null}
      <DashboardLayout snapshot={result.data} />
    </>
  );
}
