import { loadDashboardData, type ChannelFilter } from '@/lib/actions/dashboard';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getTenantHealth } from '@/lib/tenant-health';

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

  // Cargas en paralelo: dashboard snapshot + tenant health (para activation checklist).
  const effective = await getEffectiveTenant();
  const [result, tenantHealth] = await Promise.all([
    loadDashboardData({
      windowKey: sp.w ?? null,
      channelKey: parseChannelKey(sp.ch),
      customFrom: sp.from ?? null,
      customTo: sp.to ?? null,
    }),
    effective ? getTenantHealth(effective.tenantId) : Promise.resolve(null),
  ]);

  if (!result.ok) {
    return (
      <div className="p-8 text-sm text-destructive">
        Error cargando dashboard: {result.error}
      </div>
    );
  }

  return <DashboardLayout snapshot={result.data} tenantHealth={tenantHealth} />;
}
