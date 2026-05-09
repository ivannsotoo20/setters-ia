import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, Users } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAgencyAggregates } from '@/lib/actions/admin';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

export default async function AgencyDashboardPage() {
  // Gate: solo agency admins
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user!.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  const result = await getAgencyAggregates();

  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error cargando agregados</CardTitle>
          <CardDescription>{result.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const a = result.data!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Vista agencia · Fyzon
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
        >
          Superadmin
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Sub-cuentas"
          value={`${a.tenantsActive}/${a.tenantsTotal}`}
          hint="activas / total"
        />
        <KpiCard
          label="Conversaciones"
          value={String(a.conversationsTotalAllTenants)}
          hint="todas las sub-cuentas"
        />
        <KpiCard
          label="Cualificadas"
          value={String(a.qualifiedTotalAllTenants)}
          hint={`${a.pausedTotalAllTenants} con IA pausada`}
        />
        <KpiCard
          label="Coste 24h"
          value={`$${a.costLast24hAllTenants.toFixed(4)}`}
          hint={`${a.pipelineRunsLast24h} pipeline runs`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Sub-cuentas
            </CardTitle>
            <CardDescription>
              Lista de tenants con KPIs por sub-cuenta. Desde ahí puedes entrar
              como un trainer (impersonate) para soportarle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/tenants">
                Ver sub-cuentas <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Onboarding (próximamente)
            </CardTitle>
            <CardDescription>
              Wizard para crear nueva sub-cuenta + provisionar tokens + configurar
              provider inicial. Sin SQL manual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Crear sub-cuenta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
