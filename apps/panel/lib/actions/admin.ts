'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  clearImpersonateTenantId,
  setImpersonateTenantId,
} from '@/lib/impersonate';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — required for admin Server Actions');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verifica que el caller es agency admin. Lanza si no.
 */
async function requireAgencyAdmin(): Promise<{ userId: string; profileTenantId: number }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_agency_admin) {
    throw new Error('forbidden — requires is_agency_admin');
  }
  return { userId: user.id, profileTenantId: Number(profile.tenant_id) };
}

// ---------------------------------------------------------------------------
// Listado de tenants con KPIs agregados
// ---------------------------------------------------------------------------

export interface TenantWithStats {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  conversationsTotal: number;
  conversationsActive: number;
  qualifiedTotal: number;
  pausedTotal: number;
  costLast24h: number;
}

export async function listAllTenants(): Promise<ActionResult<TenantWithStats[]>> {
  try {
    await requireAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const supabase = getServiceRoleClient();

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, is_active, created_at')
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Cargar stats de cada tenant en paralelo. Para 5-50 tenants es OK; si crece
  // mucho cambiamos a un view materialized o RPC.
  const stats = await Promise.all(
    (tenants ?? []).map(async (t) => {
      const tenantId = Number(t.id);
      const [convAll, convActive, qualified, paused, costRows] = await Promise.all([
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
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
          .gte('started_at', since24h),
      ]);

      const cost = (costRows.data ?? []).reduce(
        (acc: number, r: { total_cost_usd: number | null }) =>
          acc + (typeof r.total_cost_usd === 'number' ? r.total_cost_usd : 0),
        0,
      );

      return {
        id: tenantId,
        slug: String(t.slug),
        name: String(t.name),
        isActive: Boolean(t.is_active),
        createdAt: String(t.created_at),
        conversationsTotal: convAll.count ?? 0,
        conversationsActive: convActive.count ?? 0,
        qualifiedTotal: qualified.count ?? 0,
        pausedTotal: paused.count ?? 0,
        costLast24h: cost,
      };
    }),
  );

  return { ok: true, data: stats };
}

export interface AgencyAggregates {
  tenantsTotal: number;
  tenantsActive: number;
  conversationsTotalAllTenants: number;
  qualifiedTotalAllTenants: number;
  pausedTotalAllTenants: number;
  costLast24hAllTenants: number;
  pipelineRunsLast24h: number;
}

export async function getAgencyAggregates(): Promise<ActionResult<AgencyAggregates>> {
  try {
    await requireAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const supabase = getServiceRoleClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [tenantsAll, tenantsActive, convAll, qualified, paused, costRows, runs24h] =
    await Promise.all([
      supabase.from('tenants').select('id', { count: 'exact', head: true }),
      supabase
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('is_qualified', true),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .not('ai_paused_until', 'is', null),
      supabase
        .from('pipeline_runs')
        .select('total_cost_usd')
        .gte('started_at', since24h),
      supabase
        .from('pipeline_runs')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', since24h),
    ]);

  const cost = (costRows.data ?? []).reduce(
    (acc: number, r: { total_cost_usd: number | null }) =>
      acc + (typeof r.total_cost_usd === 'number' ? r.total_cost_usd : 0),
    0,
  );

  return {
    ok: true,
    data: {
      tenantsTotal: tenantsAll.count ?? 0,
      tenantsActive: tenantsActive.count ?? 0,
      conversationsTotalAllTenants: convAll.count ?? 0,
      qualifiedTotalAllTenants: qualified.count ?? 0,
      pausedTotalAllTenants: paused.count ?? 0,
      costLast24hAllTenants: cost,
      pipelineRunsLast24h: runs24h.count ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Impersonate
// ---------------------------------------------------------------------------

export async function startImpersonating(tenantId: number): Promise<ActionResult> {
  try {
    await requireAgencyAdmin();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { ok: false, error: 'tenantId inválido' };
  }

  // Validar que el tenant existe.
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'tenant no existe' };

  await setImpersonateTenantId(tenantId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function stopImpersonating(): Promise<ActionResult> {
  await clearImpersonateTenantId();
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Server Action que inicia impersonate y redirige al dashboard de tenant.
 * Útil como `formAction` en botones de la lista admin.
 */
export async function startImpersonatingAndRedirect(formData: FormData): Promise<void> {
  const tenantIdRaw = formData.get('tenant_id');
  const tenantId = Number(tenantIdRaw);
  const result = await startImpersonating(tenantId);
  if (result.ok) {
    redirect('/dashboard');
  }
}
