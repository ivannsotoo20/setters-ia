'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Sprint Iota.1 — Server Actions de followups (per-canal + provider + AI-personalize).
 *
 * - WhatsApp: requiere template aprobada YCloud/Meta. Texto libre bloqueado
 *   estricto pasadas las 24h del último mensaje del lead (Meta bloquea número).
 * - Instagram/Facebook: texto libre + opción "personalizar con IA al enviar"
 *   (motor genera mensaje contextual al disparo).
 *
 * Auth:
 *   - listFollowupTemplates / listScheduledFollowups: viewer+ (lectura).
 *   - createFollowupTemplate / updateFollowupTemplate / deleteFollowupTemplate
 *     / scheduleFollowup / cancelScheduledFollowup: admin+ (no viewer).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export type ChannelKind = 'whatsapp' | 'instagram_dm' | 'facebook_messenger';
export type FollowupProvider = 'manual' | 'ycloud' | 'meta_cloud' | 'ghl';
export type FollowupTemplateStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

function isAdminOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

function isCollaboratorOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role !== 'viewer';
}

const VALID_CHANNEL_KINDS: readonly ChannelKind[] = [
  'whatsapp',
  'instagram_dm',
  'facebook_messenger',
] as const;

// ===========================================================================
// Templates CRUD
// ===========================================================================

export interface FollowupTemplateRow {
  id: number;
  name: string;
  channelKind: ChannelKind;
  provider: FollowupProvider;
  body: string | null;
  description: string | null;
  providerTemplateId: string | null;
  language: string | null;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | null;
  status: FollowupTemplateStatus;
  variables: Array<{ name: string; sample?: string | null }>;
  aiPersonalize: boolean;
  aiGuide: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listFollowupTemplates(input?: {
  channelKind?: ChannelKind;
}): Promise<ActionResult<FollowupTemplateRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  let query = supabase
    .from('followup_templates')
    .select(
      `id, name, channel_kind, provider, body, description,
       provider_template_id, language, category, status, variables, provider_metadata,
       ai_personalize, ai_guide, created_at, updated_at`,
    )
    .eq('tenant_id', eff.tenantId)
    .order('channel_kind', { ascending: true })
    .order('name', { ascending: true });
  if (input?.channelKind) query = query.eq('channel_kind', input.channelKind);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((t) => ({
      id: Number(t.id),
      name: String(t.name),
      channelKind: String(t.channel_kind) as ChannelKind,
      provider: String(t.provider) as FollowupProvider,
      body: (t.body as string | null) ?? null,
      description: (t.description as string | null) ?? null,
      providerTemplateId: (t.provider_template_id as string | null) ?? null,
      language: (t.language as string | null) ?? null,
      category: (t.category as FollowupTemplateRow['category']) ?? null,
      status: String(t.status) as FollowupTemplateStatus,
      variables: Array.isArray(t.variables)
        ? (t.variables as Array<{ name: string; sample?: string | null }>)
        : [],
      aiPersonalize: Boolean(t.ai_personalize),
      aiGuide: (t.ai_guide as string | null) ?? null,
      createdAt: String(t.created_at),
      updatedAt: String(t.updated_at),
    })),
  };
}

export interface CreateTemplateInput {
  name: string;
  channelKind: ChannelKind;
  body?: string | null;
  description?: string | null;
  // AI-personalize (solo IG/FB)
  aiPersonalize?: boolean;
  aiGuide?: string | null;
  // YCloud/Meta-Cloud (solo WA, vía sync — no se crea manual)
  // Estos NO se aceptan en createFollowupTemplate manual; usar syncYCloudTemplates.
}

export async function createFollowupTemplate(
  input: CreateTemplateInput,
): Promise<ActionResult<{ id: number }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden crear plantillas' };
  }

  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, error: 'nombre vacío' };
  if (name.length > 80) return { ok: false, error: 'nombre demasiado largo (>80)' };

  if (!VALID_CHANNEL_KINDS.includes(input.channelKind)) {
    return { ok: false, error: 'channel_kind inválido' };
  }

  // WhatsApp NO acepta creación manual — debe pasar por syncYCloudTemplates.
  if (input.channelKind === 'whatsapp') {
    return {
      ok: false,
      error:
        'plantillas WhatsApp solo se crean sincronizando desde YCloud (botón "Sincronizar YCloud")',
    };
  }

  // IG/FB: body o aiGuide obligatorio
  const body = (input.body ?? '').trim();
  const aiPersonalize = input.aiPersonalize === true;
  const aiGuide = (input.aiGuide ?? '').trim();
  if (aiPersonalize && !aiGuide) {
    return { ok: false, error: 'al activar AI-personalize, la guía IA es obligatoria' };
  }
  if (!aiPersonalize && !body) {
    return { ok: false, error: 'cuerpo del mensaje vacío' };
  }
  if (body.length > 4000) return { ok: false, error: 'cuerpo demasiado largo (>4000)' };
  if (aiGuide.length > 2000) return { ok: false, error: 'guía IA demasiado larga (>2000)' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('followup_templates')
    .insert({
      tenant_id: eff.tenantId,
      name,
      channel_kind: input.channelKind,
      provider: 'manual',
      body: aiPersonalize ? null : body,
      description: input.description?.trim() || null,
      ai_personalize: aiPersonalize,
      ai_guide: aiPersonalize ? aiGuide : null,
      status: 'approved',
      created_by: eff.userId,
    })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'ya existe una plantilla con ese nombre en este canal' };
    }
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  revalidatePath('/settings/followup-templates');
  return { ok: true, data: { id: Number(data.id) } };
}

export interface UpdateTemplatePatch {
  name?: string;
  body?: string | null;
  description?: string | null;
  aiPersonalize?: boolean;
  aiGuide?: string | null;
  status?: FollowupTemplateStatus; // solo agency admin para enabled/disabled YCloud
}

export async function updateFollowupTemplate(input: {
  templateId: number;
  patch: UpdateTemplatePatch;
}): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden modificar plantillas' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing } = await supabase
    .from('followup_templates')
    .select('tenant_id, channel_kind, provider')
    .eq('id', input.templateId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'plantilla no encontrada' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const isWA = existing.channel_kind === 'whatsapp';
  const isYCloud = existing.provider === 'ycloud' || existing.provider === 'meta_cloud';

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.patch.name !== undefined) {
    if (isYCloud) {
      return { ok: false, error: 'no se puede renombrar una plantilla sincronizada (lo controla el provider)' };
    }
    const n = input.patch.name.trim();
    if (!n) return { ok: false, error: 'nombre vacío' };
    if (n.length > 80) return { ok: false, error: 'nombre demasiado largo' };
    updates.name = n;
  }
  if (input.patch.body !== undefined) {
    if (isWA) {
      return { ok: false, error: 'el cuerpo de plantillas WhatsApp lo controla YCloud' };
    }
    const b = (input.patch.body ?? '').trim();
    if (b.length > 4000) return { ok: false, error: 'cuerpo demasiado largo' };
    updates.body = b.length > 0 ? b : null;
  }
  if (input.patch.description !== undefined) {
    const d = input.patch.description?.trim() ?? null;
    updates.description = d && d.length > 0 ? d : null;
  }
  if (input.patch.aiPersonalize !== undefined) {
    if (isWA) {
      return { ok: false, error: 'AI-personalize no aplica en WhatsApp' };
    }
    updates.ai_personalize = input.patch.aiPersonalize === true;
    if (input.patch.aiPersonalize && input.patch.aiGuide !== undefined) {
      const g = (input.patch.aiGuide ?? '').trim();
      if (!g) return { ok: false, error: 'guía IA vacía pero aiPersonalize activado' };
      updates.ai_guide = g;
    } else if (!input.patch.aiPersonalize) {
      updates.ai_guide = null;
    }
  } else if (input.patch.aiGuide !== undefined) {
    const g = input.patch.aiGuide?.trim() ?? null;
    updates.ai_guide = g && g.length > 0 ? g : null;
  }
  if (input.patch.status !== undefined && eff.isAgencyAdmin) {
    updates.status = input.patch.status;
  }

  const { error } = await supabase
    .from('followup_templates')
    .update(updates)
    .eq('id', input.templateId);
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'ya existe una plantilla con ese nombre en este canal' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings/followup-templates');
  return { ok: true };
}

export async function deleteFollowupTemplate(templateId: number): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden borrar plantillas' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing } = await supabase
    .from('followup_templates')
    .select('tenant_id, provider')
    .eq('id', templateId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'plantilla no encontrada' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  // No bloquear borrado de YCloud — es solo en local. Se vuelve a sincronizar si quiere.

  const { error } = await supabase.from('followup_templates').delete().eq('id', templateId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/followup-templates');
  return { ok: true };
}

// ===========================================================================
// Schedule followup (one-shot manual)
// ===========================================================================

export interface ScheduleFollowupInput {
  conversationId: number;
  body?: string;
  templateId?: number | null;
  scheduledAtIso: string;
  autoCancelOnReply?: boolean;
  /** Solo IG/FB: si true, motor genera mensaje contextual al enviar usando ai_guide. */
  aiPersonalize?: boolean;
  /** Si aiPersonalize=true y no hay templateId, el trainer puede pasar guide ad-hoc. */
  aiGuide?: string;
}

const MIN_FUTURE_MS = 30_000;
const MAX_FUTURE_MS = 365 * 86400_000;
const WA_24H_MS = 24 * 60 * 60 * 1000;

export async function scheduleFollowup(
  input: ScheduleFollowupInput,
): Promise<ActionResult<{ id: number }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden programar followups' };
  }

  const scheduledMs = Date.parse(input.scheduledAtIso);
  if (!Number.isFinite(scheduledMs)) return { ok: false, error: 'fecha programada inválida' };
  if (scheduledMs <= Date.now() + MIN_FUTURE_MS) {
    return { ok: false, error: 'la fecha debe ser al menos 30s en el futuro' };
  }
  if (scheduledMs > Date.now() + MAX_FUTURE_MS) {
    return { ok: false, error: 'la fecha no puede ser más de 1 año en el futuro' };
  }

  const supabase = getServiceRoleClient();

  // 1. Cargar conversation con channel info
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id, channel_id, last_message_at')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data: channel } = await supabase
    .from('channels')
    .select('channel_type')
    .eq('id', Number(conv.channel_id))
    .maybeSingle();
  if (!channel) return { ok: false, error: 'no se pudo resolver el canal de la conversación' };
  const channelKind = String(channel.channel_type) as ChannelKind;

  // 2. Cargar template si se pasa
  let template: FollowupTemplateRow | null = null;
  if (input.templateId != null) {
    const { data: tpl } = await supabase
      .from('followup_templates')
      .select(
        `id, name, channel_kind, provider, body, status, language, provider_template_id,
         variables, ai_personalize, ai_guide`,
      )
      .eq('id', input.templateId)
      .eq('tenant_id', Number(conv.tenant_id))
      .maybeSingle();
    if (!tpl) return { ok: false, error: 'plantilla no encontrada o no pertenece al tenant' };
    if (tpl.channel_kind !== channelKind) {
      return {
        ok: false,
        error: `la plantilla es de canal ${tpl.channel_kind}, esta conversación es ${channelKind}`,
      };
    }
    if (tpl.status !== 'approved') {
      return { ok: false, error: `plantilla no aprobada (status=${tpl.status})` };
    }
    template = {
      id: Number(tpl.id),
      name: String(tpl.name),
      channelKind: tpl.channel_kind as ChannelKind,
      provider: tpl.provider as FollowupProvider,
      body: (tpl.body as string | null) ?? null,
      description: null,
      providerTemplateId: (tpl.provider_template_id as string | null) ?? null,
      language: (tpl.language as string | null) ?? null,
      category: null,
      status: tpl.status as FollowupTemplateStatus,
      variables: Array.isArray(tpl.variables)
        ? (tpl.variables as Array<{ name: string; sample?: string | null }>)
        : [],
      aiPersonalize: Boolean(tpl.ai_personalize),
      aiGuide: (tpl.ai_guide as string | null) ?? null,
      createdAt: '',
      updatedAt: '',
    };
  }

  // 3. Validación crítica WA 24h
  if (channelKind === 'whatsapp') {
    const lastLeadMs = conv.last_message_at ? Date.parse(String(conv.last_message_at)) : 0;
    const hoursSinceLead = (Date.now() - lastLeadMs) / 3600000;
    const isOver24h = lastLeadMs === 0 || hoursSinceLead > 24;
    if (isOver24h) {
      if (!template || (template.provider !== 'ycloud' && template.provider !== 'meta_cloud')) {
        return {
          ok: false,
          error:
            'WhatsApp: pasadas 24h del último mensaje del lead solo se permiten plantillas aprobadas (YCloud/Meta). Texto libre bloqueado por política Meta para evitar bloqueo del número.',
        };
      }
      if (template.status !== 'approved') {
        return { ok: false, error: 'WhatsApp: la plantilla seleccionada no está aprobada' };
      }
    }
  }

  // 4. AI-personalize solo IG/FB
  const aiPersonalize = input.aiPersonalize === true || template?.aiPersonalize === true;
  if (aiPersonalize && channelKind === 'whatsapp') {
    return {
      ok: false,
      error: 'AI-personalize no soportado en WhatsApp (las plantillas son fijas vía YCloud)',
    };
  }
  const aiGuide = aiPersonalize
    ? (template?.aiGuide ?? input.aiGuide ?? '').trim()
    : null;
  if (aiPersonalize && !aiGuide) {
    return { ok: false, error: 'AI-personalize requiere una guía IA (de la plantilla o ad-hoc)' };
  }

  // 5. Resolver mensaje a guardar
  let bodyToStore: string | null;
  if (template) {
    bodyToStore = template.body; // puede ser null si template tiene AI-personalize
  } else {
    bodyToStore = (input.body ?? '').trim();
    if (!aiPersonalize && (!bodyToStore || bodyToStore.length === 0)) {
      return { ok: false, error: 'mensaje vacío' };
    }
    if (bodyToStore && bodyToStore.length > 4000) {
      return { ok: false, error: 'mensaje demasiado largo (>4000)' };
    }
  }

  // 6. Resolver integration_account activa
  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('channel_id', Number(conv.channel_id))
    .eq('tenant_id', Number(conv.tenant_id))
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!ia) {
    return { ok: false, error: 'el canal de esta conversación no tiene integration_account activa' };
  }

  // 7. INSERT message_schedules
  const { data, error } = await supabase
    .from('message_schedules')
    .insert({
      tenant_id: Number(conv.tenant_id),
      conversation_id: input.conversationId,
      integration_account_id: Number(ia.id),
      message_type: 'follow_up',
      message: bodyToStore,
      has_attachment: false,
      scheduled_at: new Date(scheduledMs).toISOString(),
      status: 'pending',
      attempts: 0,
      auto_cancel_on_reply: input.autoCancelOnReply !== false,
      created_by_user_id: eff.userId,
      template_id: input.templateId ?? null,
      triggered_by: 'manual',
      ai_personalize: aiPersonalize,
      ai_guide: aiGuide,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${input.conversationId}`);
  return { ok: true, data: { id: Number(data.id) } };
}

// ===========================================================================
// Cancel + List
// ===========================================================================

/**
 * Adelanta el envío de un followup pending: pone scheduled_at = NOW + 30s
 * para que el siguiente outbound-tick (cada 5s) lo coja inmediatamente.
 */
export async function sendScheduledFollowupNow(scheduleId: number): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden adelantar followups' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing } = await supabase
    .from('message_schedules')
    .select('tenant_id, status, conversation_id')
    .eq('id', scheduleId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'followup no encontrado' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  if (existing.status !== 'pending') {
    return { ok: false, error: `no se puede adelantar (status=${existing.status})` };
  }

  const newScheduledAt = new Date(Date.now() + 30_000).toISOString();
  const { error } = await supabase
    .from('message_schedules')
    .update({ scheduled_at: newScheduledAt })
    .eq('id', scheduleId)
    .eq('status', 'pending'); // race-safe: solo si sigue pending
  if (error) return { ok: false, error: error.message };

  revalidatePath('/conversations');
  if (existing.conversation_id) {
    revalidatePath(`/conversations/${existing.conversation_id}`);
  }
  return { ok: true };
}

export async function cancelScheduledFollowup(scheduleId: number): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden cancelar followups' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing } = await supabase
    .from('message_schedules')
    .select('tenant_id, status, conversation_id')
    .eq('id', scheduleId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'followup no encontrado' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  if (existing.status !== 'pending') {
    return { ok: false, error: `no se puede cancelar (status=${existing.status})` };
  }

  const { error } = await supabase
    .from('message_schedules')
    .update({ status: 'cancelled', last_error: 'manually cancelled by user' })
    .eq('id', scheduleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/conversations');
  if (existing.conversation_id) {
    revalidatePath(`/conversations/${existing.conversation_id}`);
  }
  return { ok: true };
}

export interface ScheduledFollowupRow {
  id: number;
  body: string | null;
  scheduledAtIso: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  autoCancelOnReply: boolean;
  templateId: number | null;
  templateName: string | null;
  triggeredBy: 'manual' | 'auto_inactivity' | 'manual_pipeline';
  sequenceIndex: number | null;
  aiPersonalize: boolean;
  aiGuide: string | null;
  createdAt: string;
  sentAt: string | null;
  lastError: string | null;
}

export async function listScheduledFollowups(
  conversationId: number,
): Promise<ActionResult<ScheduledFollowupRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data, error } = await supabase
    .from('message_schedules')
    .select(
      `id, message, scheduled_at, status, auto_cancel_on_reply, template_id,
       triggered_by, sequence_index, ai_personalize, ai_guide,
       created_at, sent_at, last_error,
       followup_templates(name)`,
    )
    .eq('conversation_id', conversationId)
    .eq('message_type', 'follow_up')
    .order('scheduled_at', { ascending: true });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const tplRel = r.followup_templates as { name: string } | { name: string }[] | null;
      const tplObj = Array.isArray(tplRel) ? tplRel[0] ?? null : tplRel;
      return {
        id: Number(r.id),
        body: (r.message as string | null) ?? null,
        scheduledAtIso: String(r.scheduled_at),
        status: String(r.status) as ScheduledFollowupRow['status'],
        autoCancelOnReply: Boolean(r.auto_cancel_on_reply),
        templateId: r.template_id != null ? Number(r.template_id) : null,
        templateName: tplObj?.name ?? null,
        triggeredBy: (String(r.triggered_by) as ScheduledFollowupRow['triggeredBy']) ?? 'manual',
        sequenceIndex: r.sequence_index != null ? Number(r.sequence_index) : null,
        aiPersonalize: Boolean(r.ai_personalize),
        aiGuide: (r.ai_guide as string | null) ?? null,
        createdAt: String(r.created_at),
        sentAt: r.sent_at ? String(r.sent_at) : null,
        lastError: (r.last_error as string | null) ?? null,
      };
    }),
  };
}
