'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Sprint Iota — Server Actions para followups manuales (one-shot) +
 * plantillas reutilizables.
 *
 * Auth:
 *   - listFollowupTemplates / listScheduledFollowups: viewer+ (lectura).
 *   - createFollowupTemplate / updateFollowupTemplate / deleteFollowupTemplate
 *     / scheduleFollowup / cancelScheduledFollowup: admin+ (no viewer).
 *
 * Auto-cancel: lo gestiona el trigger DB cancel_followups_on_lead_reply
 * (migration 027). Cuando el lead responde, todos los followups pending
 * con auto_cancel_on_reply=true se marcan como 'cancelled' en BD.
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

function isAdminOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

// ===========================================================================
// Templates CRUD
// ===========================================================================

export interface FollowupTemplateRow {
  id: number;
  name: string;
  body: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listFollowupTemplates(): Promise<ActionResult<FollowupTemplateRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('followup_templates')
    .select('id, name, body, description, created_at, updated_at')
    .eq('tenant_id', eff.tenantId)
    .order('name', { ascending: true });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((t) => ({
      id: Number(t.id),
      name: String(t.name),
      body: String(t.body),
      description: t.description as string | null,
      createdAt: String(t.created_at),
      updatedAt: String(t.updated_at),
    })),
  };
}

export interface CreateTemplateInput {
  name: string;
  body: string;
  description?: string | null;
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
  const body = (input.body ?? '').trim();
  if (!name) return { ok: false, error: 'nombre vacío' };
  if (name.length > 80) return { ok: false, error: 'nombre demasiado largo (>80)' };
  if (!body) return { ok: false, error: 'cuerpo del mensaje vacío' };
  if (body.length > 4000) return { ok: false, error: 'cuerpo demasiado largo (>4000)' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('followup_templates')
    .insert({
      tenant_id: eff.tenantId,
      name,
      body,
      description: input.description?.trim() || null,
      created_by: eff.userId,
    })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'ya existe una plantilla con ese nombre' };
    }
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  revalidatePath('/settings/followup-templates');
  return { ok: true, data: { id: Number(data.id) } };
}

export interface UpdateTemplatePatch {
  name?: string;
  body?: string;
  description?: string | null;
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
    .select('tenant_id')
    .eq('id', input.templateId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'plantilla no encontrada' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.patch.name !== undefined) {
    const n = input.patch.name.trim();
    if (!n) return { ok: false, error: 'nombre vacío' };
    if (n.length > 80) return { ok: false, error: 'nombre demasiado largo' };
    updates.name = n;
  }
  if (input.patch.body !== undefined) {
    const b = input.patch.body.trim();
    if (!b) return { ok: false, error: 'cuerpo vacío' };
    if (b.length > 4000) return { ok: false, error: 'cuerpo demasiado largo' };
    updates.body = b;
  }
  if (input.patch.description !== undefined) {
    const d = input.patch.description?.trim() ?? null;
    updates.description = d && d.length > 0 ? d : null;
  }

  const { error } = await supabase
    .from('followup_templates')
    .update(updates)
    .eq('id', input.templateId);
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'ya existe una plantilla con ese nombre' };
    }
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
    .select('tenant_id')
    .eq('id', templateId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'plantilla no encontrada' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { error } = await supabase.from('followup_templates').delete().eq('id', templateId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/followup-templates');
  return { ok: true };
}

// ===========================================================================
// Schedule followup (one-shot)
// ===========================================================================

export interface ScheduleFollowupInput {
  conversationId: number;
  body: string;
  scheduledAtIso: string; // ISO timestamp futuro
  templateId?: number | null;
  autoCancelOnReply?: boolean; // default true
}

export async function scheduleFollowup(
  input: ScheduleFollowupInput,
): Promise<ActionResult<{ id: number }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden programar followups' };
  }

  const body = (input.body ?? '').trim();
  if (!body) return { ok: false, error: 'mensaje vacío' };
  if (body.length > 4000) return { ok: false, error: 'mensaje demasiado largo (>4000)' };

  const scheduledMs = Date.parse(input.scheduledAtIso);
  if (!Number.isFinite(scheduledMs)) return { ok: false, error: 'fecha programada inválida' };
  if (scheduledMs <= Date.now() + 30_000) {
    return { ok: false, error: 'la fecha debe ser al menos 30s en el futuro' };
  }
  if (scheduledMs > Date.now() + 365 * 86400_000) {
    return { ok: false, error: 'la fecha no puede ser más de 1 año en el futuro' };
  }

  const supabase = getServiceRoleClient();

  // Verificar conv pertenece al tenant
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  // Resolver integration_account_id activo del canal de la conv
  const { data: convChannel } = await supabase
    .from('conversations')
    .select('channel_id')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!convChannel) return { ok: false, error: 'no se pudo resolver el canal de la conversación' };

  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('channel_id', Number(convChannel.channel_id))
    .eq('tenant_id', Number(conv.tenant_id))
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!ia) {
    return {
      ok: false,
      error: 'el canal de esta conversación no tiene integration_account activa',
    };
  }

  // Verificar template_id si se pasa
  if (input.templateId != null) {
    const { data: tpl } = await supabase
      .from('followup_templates')
      .select('tenant_id')
      .eq('id', input.templateId)
      .maybeSingle();
    if (!tpl || Number(tpl.tenant_id) !== Number(conv.tenant_id)) {
      return { ok: false, error: 'la plantilla no pertenece a este tenant' };
    }
  }

  const { data, error } = await supabase
    .from('message_schedules')
    .insert({
      tenant_id: Number(conv.tenant_id),
      conversation_id: input.conversationId,
      integration_account_id: Number(ia.id),
      message_type: 'follow_up',
      message: body,
      has_attachment: false,
      scheduled_at: new Date(scheduledMs).toISOString(),
      status: 'pending',
      attempts: 0,
      auto_cancel_on_reply: input.autoCancelOnReply !== false,
      created_by_user_id: eff.userId,
      template_id: input.templateId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${input.conversationId}`);
  return { ok: true, data: { id: Number(data.id) } };
}

// ===========================================================================
// Cancel scheduled followup
// ===========================================================================

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
    .update({
      status: 'cancelled',
      last_error: 'manually cancelled by user',
    })
    .eq('id', scheduleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/conversations');
  if (existing.conversation_id) {
    revalidatePath(`/conversations/${existing.conversation_id}`);
  }
  return { ok: true };
}

// ===========================================================================
// List scheduled followups (per conv)
// ===========================================================================

export interface ScheduledFollowupRow {
  id: number;
  body: string;
  scheduledAtIso: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  autoCancelOnReply: boolean;
  templateId: number | null;
  templateName: string | null;
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
  // Verificar conv tenant ownership
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
        body: String(r.message ?? ''),
        scheduledAtIso: String(r.scheduled_at),
        status: String(r.status) as ScheduledFollowupRow['status'],
        autoCancelOnReply: Boolean(r.auto_cancel_on_reply),
        templateId: r.template_id != null ? Number(r.template_id) : null,
        templateName: tplObj?.name ?? null,
        createdAt: String(r.created_at),
        sentAt: r.sent_at ? String(r.sent_at) : null,
        lastError: r.last_error ?? null,
      };
    }),
  };
}
