import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Helper de consulta a `public.v_tenant_health` (migration 045).
 *
 * Devuelve los flags agregados de un tenant: filas mínimas presentes, tokens
 * pre-warmeados, integraciones conectadas, plantillas WA aprobadas, y si el
 * onboarding está completo en su conjunto.
 *
 * Lo consumen:
 *   - `/admin/tenants/[id]` (banner warning si `coach_is_placeholder=true`).
 *   - `ActivationChecklist` del dashboard del trainer.
 *   - Posible script CLI futuro `scripts/check-tenant-health.mjs`.
 */

export interface TenantHealth {
  tenantId: number;
  slug: string;
  name: string;
  isActive: boolean;
  onboardedAt: string | null;
  createdAt: string;
  createdBy: string | null;

  hasConfig: boolean;
  hasTrainerPrefs: boolean;
  hasCoach: boolean;
  coachIsPlaceholder: boolean;

  tokenYcloud: string | null;
  tokenGhl: string | null;
  tokenLeadForm: string | null;
  tokenManychat: string | null;

  welcomeTemplateId: number | null;
  ycloudConnected: boolean;
  ghlConnected: boolean;

  hasKeywordsBienvenida: boolean;
  hasKeywordsLeadmagnet: boolean;
  approvedWaTemplates: number;
  activeMembers: number;

  isOnboardingComplete: boolean;
}

type ViewRow = {
  tenant_id: number;
  slug: string;
  name: string;
  is_active: boolean;
  onboarded_at: string | null;
  created_at: string;
  created_by: string | null;
  has_config: boolean;
  has_trainer_prefs: boolean;
  has_coach: boolean;
  coach_is_placeholder: boolean;
  token_ycloud: string | null;
  token_ghl: string | null;
  token_lead_form: string | null;
  token_manychat: string | null;
  welcome_template_id: number | null;
  ycloud_connected: boolean;
  ghl_connected: boolean;
  has_keywords_bienvenida: boolean;
  has_keywords_leadmagnet: boolean;
  approved_wa_templates: number;
  active_members: number;
  is_onboarding_complete: boolean;
};

function mapRow(row: ViewRow): TenantHealth {
  return {
    tenantId: row.tenant_id,
    slug: row.slug,
    name: row.name,
    isActive: row.is_active,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    hasConfig: row.has_config,
    hasTrainerPrefs: row.has_trainer_prefs,
    hasCoach: row.has_coach,
    coachIsPlaceholder: row.coach_is_placeholder,
    tokenYcloud: row.token_ycloud,
    tokenGhl: row.token_ghl,
    tokenLeadForm: row.token_lead_form,
    tokenManychat: row.token_manychat,
    welcomeTemplateId: row.welcome_template_id,
    ycloudConnected: row.ycloud_connected,
    ghlConnected: row.ghl_connected,
    hasKeywordsBienvenida: row.has_keywords_bienvenida,
    hasKeywordsLeadmagnet: row.has_keywords_leadmagnet,
    approvedWaTemplates: row.approved_wa_templates,
    activeMembers: row.active_members,
    isOnboardingComplete: row.is_onboarding_complete,
  };
}

export async function getTenantHealth(tenantId: number): Promise<TenantHealth | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('v_tenant_health')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    console.warn('[getTenantHealth] error', { tenantId, error });
    return null;
  }
  return data ? mapRow(data as unknown as ViewRow) : null;
}

export async function getAllTenantsHealth(): Promise<TenantHealth[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('v_tenant_health')
    .select('*')
    .order('tenant_id', { ascending: true });
  if (error) {
    console.warn('[getAllTenantsHealth] error', { error });
    return [];
  }
  return ((data ?? []) as unknown as ViewRow[]).map(mapRow);
}
