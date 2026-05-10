'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Hito 9 sub-fase 5 — Server actions del onboarding wizard / settings welcome template.
 *
 * - setWelcomeTemplate(templateId | null): designa la plantilla bienvenida default
 *   para el tenant (tenant_configs.welcome_template_id). null limpia.
 * - ensureLeadFormToken(): garantiza que existe un tenant_token con
 *   purpose='lead_form_webhook' para el tenant; lo crea si no, lo devuelve.
 * - getOnboardingStatus(): snapshot del progreso del wizard (4 steps).
 *
 * Auth: agency admin o owner/admin del tenant. Viewer NO puede modificar.
 */

export type WelcomeTemplateActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setWelcomeTemplate(
  templateId: number | null,
): Promise<WelcomeTemplateActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (effective.role === 'viewer' && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — viewer no puede configurar plantilla bienvenida' };
  }

  const supabase = getServiceRoleClient();

  // Si templateId != null, validar que la plantilla pertenece al tenant + es WA + provider ycloud/meta_cloud + status approved.
  if (templateId !== null) {
    const { data: tpl } = await supabase
      .from('followup_templates')
      .select('id, tenant_id, channel_kind, provider, status, provider_template_id, language')
      .eq('id', templateId)
      .eq('tenant_id', effective.tenantId)
      .maybeSingle();
    if (!tpl) return { ok: false, error: 'plantilla no encontrada' };
    if (tpl.channel_kind !== 'whatsapp') {
      return { ok: false, error: 'la plantilla debe ser de WhatsApp' };
    }
    if (tpl.provider !== 'ycloud' && tpl.provider !== 'meta_cloud') {
      return { ok: false, error: 'la plantilla debe ser provider YCloud o Meta Cloud' };
    }
    if (tpl.status !== 'approved') {
      return { ok: false, error: 'la plantilla debe estar aprobada' };
    }
    if (!tpl.provider_template_id || !tpl.language) {
      return { ok: false, error: 'la plantilla no tiene provider_template_id o language' };
    }
  }

  const { error } = await supabase
    .from('tenant_configs')
    .update({
      welcome_template_id: templateId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/onboarding/integrations');
  revalidatePath('/settings/followup-templates');
  revalidatePath('/settings/integrations/health');
  return { ok: true };
}

export type EnsureLeadFormTokenResult =
  | { ok: true; token: string; created: boolean }
  | { ok: false; error: string };

export async function ensureLeadFormToken(): Promise<EnsureLeadFormTokenResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (effective.role === 'viewer' && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden' };
  }

  const supabase = getServiceRoleClient();

  // Reuse existing
  const { data: existing } = await supabase
    .from('tenant_tokens')
    .select('token, is_active, revoked_at')
    .eq('tenant_id', effective.tenantId)
    .eq('purpose', 'lead_form_webhook')
    .eq('is_active', true)
    .is('revoked_at', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token) {
    return { ok: true, token: String(existing.token), created: false };
  }

  // Crear nuevo. token se autogenera por default (gen_random_bytes 24 hex).
  const { data: inserted, error } = await supabase
    .from('tenant_tokens')
    .insert({
      tenant_id: effective.tenantId,
      purpose: 'lead_form_webhook',
      is_active: true,
    })
    .select('token')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'insert_failed' };

  revalidatePath('/onboarding/integrations');
  revalidatePath('/settings/integrations/health');
  return { ok: true, token: String(inserted.token), created: true };
}

export interface OnboardingStatus {
  ghl: { connected: boolean; locationId: string | null };
  keywords: { count: number; hasBienvenida: boolean; hasLeadMagnet: boolean };
  ycloud: { connected: boolean; templatesCount: number; templatesApproved: number };
  welcome: {
    welcomeTemplateId: number | null;
    welcomeTemplateName: string | null;
    leadFormToken: string | null;
  };
}

export async function getOnboardingStatus(): Promise<
  { ok: true; data: OnboardingStatus } | { ok: false; error: string }
> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  const supabase = getServiceRoleClient();

  // GHL connected
  const { data: ghlIa } = await supabase
    .from('integration_accounts')
    .select('id, connection_config')
    .eq('tenant_id', effective.tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ghlConnected = ghlIa != null;
  const ghlLocationId =
    ghlConnected && ghlIa?.connection_config && typeof ghlIa.connection_config === 'object'
      ? (ghlIa.connection_config as { locationId?: string }).locationId ?? null
      : null;

  // Keywords
  const { data: kws } = await supabase
    .from('automation_keywords')
    .select('type')
    .eq('tenant_id', effective.tenantId)
    .eq('is_active', true);
  const kwList = kws ?? [];
  const hasBienvenida = kwList.some((k) => k.type === 'bienvenida');
  const hasLeadMagnet = kwList.some((k) => k.type === 'lm');

  // YCloud connected + templates
  const { data: ycIa } = await supabase
    .from('integration_accounts')
    .select('id, connection_config')
    .eq('tenant_id', effective.tenantId)
    .eq('provider', 'ycloud')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ycloudConnected = ycIa != null;

  let templatesCount = 0;
  let templatesApproved = 0;
  if (ycloudConnected) {
    const { data: templates } = await supabase
      .from('followup_templates')
      .select('id, status, provider')
      .eq('tenant_id', effective.tenantId)
      .eq('channel_kind', 'whatsapp');
    const list = templates ?? [];
    templatesCount = list.length;
    templatesApproved = list.filter(
      (t) =>
        t.status === 'approved' && (t.provider === 'ycloud' || t.provider === 'meta_cloud'),
    ).length;
  }

  // Welcome template
  const { data: cfg } = await supabase
    .from('tenant_configs')
    .select('welcome_template_id')
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();
  const welcomeTemplateId =
    cfg?.welcome_template_id != null ? Number(cfg.welcome_template_id) : null;

  let welcomeTemplateName: string | null = null;
  if (welcomeTemplateId) {
    const { data: tpl } = await supabase
      .from('followup_templates')
      .select('name')
      .eq('id', welcomeTemplateId)
      .maybeSingle();
    welcomeTemplateName = (tpl?.name as string | undefined) ?? null;
  }

  // lead-form token (no se crea si no existe — el wizard step 4 expone un botón)
  const { data: token } = await supabase
    .from('tenant_tokens')
    .select('token')
    .eq('tenant_id', effective.tenantId)
    .eq('purpose', 'lead_form_webhook')
    .eq('is_active', true)
    .is('revoked_at', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    data: {
      ghl: { connected: ghlConnected, locationId: ghlLocationId },
      keywords: { count: kwList.length, hasBienvenida, hasLeadMagnet },
      ycloud: { connected: ycloudConnected, templatesCount, templatesApproved },
      welcome: {
        welcomeTemplateId,
        welcomeTemplateName,
        leadFormToken: token?.token ? String(token.token) : null,
      },
    },
  };
}

export async function listWelcomeCandidateTemplates(): Promise<
  | {
      ok: true;
      data: Array<{
        id: number;
        name: string;
        provider: string;
        language: string | null;
        status: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from('followup_templates')
    .select('id, name, provider, language, status, channel_kind')
    .eq('tenant_id', effective.tenantId)
    .eq('channel_kind', 'whatsapp')
    .order('name', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? [])
      .filter((t) => t.provider === 'ycloud' || t.provider === 'meta_cloud')
      .map((t) => ({
        id: Number(t.id),
        name: String(t.name),
        provider: String(t.provider),
        language: (t.language as string | null) ?? null,
        status: String(t.status),
      })),
  };
}
