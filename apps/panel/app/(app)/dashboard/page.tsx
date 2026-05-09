import Link from 'next/link';
import { ArrowRight, MessageSquare, Sparkles, Settings } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, tenants(slug, name)')
    .eq('id', user!.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin tenant asignado</CardTitle>
          <CardDescription>
            Tu cuenta no está vinculada a un tenant. Contacta con un admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tenantId = profile.tenant_id;

  const [activeRes, qualifiedRes, pausedRes, todayCostRes, todayRunsRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('state', 'active'),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_qualified', true),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('ai_paused_until', 'is', null),
    supabase
      .from('pipeline_runs')
      .select('total_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('pipeline_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const activeCount = activeRes.count ?? 0;
  const qualifiedCount = qualifiedRes.count ?? 0;
  const pausedCount = pausedRes.count ?? 0;
  const todayRuns = todayRunsRes.count ?? 0;
  const todayCost = (todayCostRes.data ?? []).reduce(
    (acc: number, r: { total_cost_usd: number | null }) =>
      acc + (typeof r.total_cost_usd === 'number' ? r.total_cost_usd : 0),
    0,
  );

  const tenantsRel = profile.tenants as
    | { slug: string; name: string }
    | { slug: string; name: string }[]
    | null
    | undefined;
  const tenantInfo = Array.isArray(tenantsRel) ? tenantsRel[0] ?? null : tenantsRel ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Fyzon Setters · Panel
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenantInfo?.name ?? `Tenant ${tenantId}`}
          </h1>
        </div>
        <Badge variant="outline" className="capitalize">
          {profile.role}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Conversaciones activas" value={String(activeCount)} hint="state = active" />
        <KpiCard label="Cualificadas" value={String(qualifiedCount)} hint="is_qualified = true" />
        <KpiCard label="IA pausadas" value={String(pausedCount)} hint="ai_paused_until ≠ null" />
        <KpiCard
          label="Coste 24h"
          value={`$${todayCost.toFixed(4)}`}
          hint={`${todayRuns} pipeline runs`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4" />
              Conversaciones
            </CardTitle>
            <CardDescription>
              Lista de leads + estado IA + acción de pausar/reactivar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/conversations">
                Abrir <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              Keywords
            </CardTitle>
            <CardDescription>
              Patrones bienvenida / lead-magnet / inbound auto. Próximamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Configurar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="size-4" />
              Ajustes
            </CardTitle>
            <CardDescription>
              Tenant config, idioma audio, integraciones. Próximamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Abrir
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
