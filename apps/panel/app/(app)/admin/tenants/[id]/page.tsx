import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import {
  loadTenantBlocks,
  loadActiveBlock,
  listVersions,
  loadTrainerPreferences,
} from '@/lib/actions/prompts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTenantHealth } from '@/lib/tenant-health';
import { TenantPromptTabs } from './tenant-tabs';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just_created?: string }>;
}

export default async function TenantDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const justCreated = sp.just_created === '1';
  const tenantId = Number(id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) notFound();

  // Auth: agency admin
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  // Carga overview + bloques en paralelo
  const overviewResult = await loadTenantBlocks({ tenantId });
  if (!overviewResult.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/tenants"
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Sub-cuentas
        </Link>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">Error: {overviewResult.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { tenant, coach, adminOverrides, trainerPrefs } = overviewResult;

  // Cargas paralelas: contenido + versiones de cada bloque + prefs estructuradas + health.
  const [
    coachActive,
    coachVersions,
    overridesActive,
    overridesVersions,
    prefsResult,
    integrationsRows,
    health,
  ] = await Promise.all([
    loadActiveBlock({ blockKey: 'coach_v5', tenantId }),
    listVersions({ blockKey: 'coach_v5', tenantId, limit: 50 }),
    adminOverrides.isMissing
      ? Promise.resolve({ ok: true as const, block: null, draft: null })
      : loadActiveBlock({ blockKey: 'admin_overrides_v1', tenantId }),
    adminOverrides.isMissing
      ? Promise.resolve({ ok: true as const, versions: [] })
      : listVersions({ blockKey: 'admin_overrides_v1', tenantId, limit: 50 }),
    loadTrainerPreferences({ tenantId }),
    loadTenantIntegrations(tenantId),
    getTenantHealth(tenantId),
  ]);

  const tenantsForPreview = [
    { id: tenant.id, slug: tenant.slug, name: tenant.name, isActive: tenant.isActive },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/tenants"
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Sub-cuentas
        </Link>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="size-3.5" />
              Sub-cuenta · {tenant.isActive ? 'activa' : 'inactiva'}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <Badge variant="outline" className="font-mono">
                #{tenant.id}
              </Badge>
              <Badge variant="outline" className="font-mono">
                {tenant.slug}
              </Badge>
              <span className="text-muted-foreground">
                {coach.contentChars.toLocaleString()} chars coach ·{' '}
                {adminOverrides.isMissing ? 'sin overrides' : `${adminOverrides.contentChars.toLocaleString()} chars overrides`} ·{' '}
                {trainerPrefs.isMissing ? 'sin prefs trainer' : `${trainerPrefs.contentChars.toLocaleString()} chars prefs`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {justCreated ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4 flex gap-3 items-start">
            <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">
                Sub-cuenta creada. La invitación al owner ya está en camino.
              </p>
              <ol className="mt-2 space-y-0.5 list-decimal list-inside text-muted-foreground">
                <li>
                  Pega el prompt coach v3 personalizado en la tab{' '}
                  <strong className="text-foreground">Coach</strong> (abajo).
                </li>
                <li>
                  El trainer recibirá el email; cuando active, podrá entrar al
                  panel y completar el wizard de integraciones.
                </li>
                <li>
                  Si no le llega, reenvía la invitación desde la pestaña{' '}
                  <Link href={`/admin/tenants/${tenantId}/members`} className="underline hover:text-foreground">
                    Miembros
                  </Link>
                  .
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {health?.coachV3IsPlaceholder ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 flex gap-3 items-start">
            <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">
                Coach v3 todavía es el placeholder vacío.
              </p>
              <p className="text-muted-foreground mt-1">
                Edita el bloque Coach abajo con el prompt personalizado del
                trainer antes de que llegue su primer lead real. Mientras siga
                vacío, el motor responderá con un prompt incompleto.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TenantPromptTabs
        tenant={tenant}
        coach={
          coachActive.ok && coachActive.block
            ? {
                blockKey: 'coach_v5',
                tenantId: tenant.id,
                activeContent: coachActive.block.content,
                activeVersion: coachActive.block.activeVersionNumber,
                draftContent: coachActive.draft?.content ?? null,
                draftBaseVersion: coachActive.draft?.baseVersion ?? null,
                tenants: tenantsForPreview,
                initialVersions: coachVersions.ok ? coachVersions.versions : [],
              }
            : null
        }
        overrides={
          overridesActive.ok && overridesActive.block
            ? {
                blockKey: 'admin_overrides_v1',
                tenantId: tenant.id,
                activeContent: overridesActive.block.content,
                activeVersion: overridesActive.block.activeVersionNumber,
                draftContent: overridesActive.draft?.content ?? null,
                draftBaseVersion: overridesActive.draft?.baseVersion ?? null,
                tenants: tenantsForPreview,
                initialVersions: overridesVersions.ok ? overridesVersions.versions : [],
              }
            : null
        }
        trainerPrefs={prefsResult.ok ? prefsResult.preferences : null}
        integrations={integrationsRows}
      />
    </div>
  );
}

interface IntegrationRow {
  id: number;
  provider: string;
  isActive: boolean;
  channelLabel: string | null;
  channelType: string | null;
  connectionConfig: Record<string, unknown>;
  createdAt: string;
}

async function loadTenantIntegrations(tenantId: number): Promise<IntegrationRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return [];

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await sb
    .from('integration_accounts')
    .select('id, provider, is_active, connection_config, created_at, channel_id')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true });

  if (!data) return [];

  // Cargar channel info en paralelo
  const channelIds = data.map((r) => r.channel_id).filter((id): id is number => id != null);
  const channelMap = new Map<number, { label: string | null; channel_type: string }>();
  if (channelIds.length > 0) {
    const { data: chans } = await sb
      .from('channels')
      .select('id, label, channel_type')
      .in('id', channelIds);
    for (const c of chans ?? []) {
      channelMap.set(c.id as number, {
        label: (c.label as string | null) ?? null,
        channel_type: c.channel_type as string,
      });
    }
  }

  return data.map((r) => {
    const chan = r.channel_id != null ? channelMap.get(r.channel_id as number) : null;
    return {
      id: r.id as number,
      provider: r.provider as string,
      isActive: Boolean(r.is_active),
      channelLabel: chan?.label ?? null,
      channelType: chan?.channel_type ?? null,
      connectionConfig: (r.connection_config as Record<string, unknown>) ?? {},
      createdAt: r.created_at as string,
    };
  });
}
