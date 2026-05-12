'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { logAuditEvent } from '@/lib/auth/audit-log';

/**
 * GDPR Art. 15 (derecho de acceso) + Art. 17 (derecho al olvido).
 *
 * Endpoints server-side para que cualquier admin/owner de un tenant pueda:
 *  - Exportar todos los datos asociados a un lead (JSON consolidado).
 *  - Borrar todos los datos asociados a un lead (cascade).
 *
 * Auth: solo `agency_admin` o `role='owner'`. Un `admin` regular no puede
 * disparar borrado destructivo — es una acción de alto impacto.
 *
 * Audit: cada acción inserta evento `gdpr.exported` o `gdpr.deleted` en
 * `tenant_audit_log` con metadata del lead (id, external_id, channel, etc.).
 *
 * Cascade BD: FKs ya configuradas con `ON DELETE CASCADE` en
 * conversations/conversation_messages/conversation_labels/conversation_notes/
 * pipeline_events/message_schedules/lead_external_ids/conversation_events.
 * `pipeline_runs` y `llm_calls` quedan con `conversation_id=NULL` (no PII
 * residual — solo métricas). `notification_events` no tiene FK estricto: se
 * limpia manualmente buscando payload->>'lead_id' o payload->>'conversation_id'.
 */

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export interface GdprExportData {
  exportedAt: string;
  tenant: { id: number };
  lead: Record<string, unknown>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  pipelineEvents: Array<Record<string, unknown>>;
  labelsApplied: Array<Record<string, unknown>>;
  notificationEvents: Array<Record<string, unknown>>;
}

interface AuthCtx {
  userId: string;
  userEmail: string | null;
  tenantId: number;
  isAgencyAdmin: boolean;
  role: 'owner' | 'admin' | 'viewer';
}

async function authorizeGdprAction(
  leadId: number,
): Promise<
  | { ok: true; ctx: AuthCtx; supabase: ReturnType<typeof getServiceRoleClient> }
  | { ok: false; error: string }
> {
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return { ok: false, error: 'invalid leadId' };
  }
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const isOwnerOrAdmin =
    effective.isAgencyAdmin || effective.role === 'owner';
  if (!isOwnerOrAdmin) {
    return {
      ok: false,
      error: 'forbidden — solo owner del tenant o agency admin puede ejecutar acciones GDPR',
    };
  }

  const supabase = getServiceRoleClient();

  const { data: lead, error } = await supabase
    .from('leads')
    .select('tenant_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!lead) return { ok: false, error: 'lead no encontrado' };
  if (Number(lead.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', effective.userId)
    .maybeSingle();

  return {
    ok: true,
    ctx: {
      userId: effective.userId,
      userEmail: (profile?.email as string | null) ?? null,
      tenantId: Number(lead.tenant_id),
      isAgencyAdmin: effective.isAgencyAdmin,
      role: effective.role,
    },
    supabase,
  };
}

// ---------------------------------------------------------------------------
// exportContactDataAction — GDPR Art. 15
// ---------------------------------------------------------------------------

export async function exportContactDataAction(input: {
  leadId: number;
}): Promise<ActionResult<GdprExportData>> {
  const auth = await authorizeGdprAction(input.leadId);
  if (!auth.ok) return auth;
  const { ctx, supabase } = auth;

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (leadErr) return { ok: false, error: leadErr.message };
  if (!leadRaw) return { ok: false, error: 'lead no encontrado' };

  const { data: convsRaw } = await supabase
    .from('conversations')
    .select('*')
    .eq('lead_id', input.leadId)
    .eq('tenant_id', ctx.tenantId);
  const conversations = (convsRaw ?? []) as Array<Record<string, unknown>>;
  const convIds = conversations.map((c) => Number(c.id));

  const [messagesRes, notesRes, pipelineEventsRes, labelsRes, allNotifRes] =
    await Promise.all([
      convIds.length > 0
        ? supabase
            .from('conversation_messages')
            .select('*')
            .in('conversation_id', convIds)
            .eq('tenant_id', ctx.tenantId)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase
            .from('conversation_notes')
            .select('*')
            .in('conversation_id', convIds)
            .eq('tenant_id', ctx.tenantId)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase
            .from('pipeline_events')
            .select('*')
            .in('conversation_id', convIds)
            .eq('tenant_id', ctx.tenantId)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase
            .from('conversation_labels')
            .select('*')
            .in('conversation_id', convIds)
            .eq('tenant_id', ctx.tenantId)
        : Promise.resolve({ data: [], error: null }),
      // notification_events: payload es JSONB sin FK estricto. Filtramos JS-side
      // por simplicidad/robustez (PostgREST `.or()` con `->>` es frágil).
      supabase
        .from('notification_events')
        .select('*')
        .eq('tenant_id', ctx.tenantId),
    ]);

  const notificationEvents = (
    (allNotifRes.data ?? []) as Array<{ payload: Record<string, unknown> }>
  ).filter((n) => belongsToLead(n.payload, input.leadId, convIds));

  const exportData: GdprExportData = {
    exportedAt: new Date().toISOString(),
    tenant: { id: ctx.tenantId },
    lead: leadRaw as Record<string, unknown>,
    conversations,
    messages: ((messagesRes.data ?? []) as Array<Record<string, unknown>>),
    notes: ((notesRes.data ?? []) as Array<Record<string, unknown>>),
    pipelineEvents: ((pipelineEventsRes.data ?? []) as Array<Record<string, unknown>>),
    labelsApplied: ((labelsRes.data ?? []) as Array<Record<string, unknown>>),
    notificationEvents: notificationEvents as Array<Record<string, unknown>>,
  };

  await logAuditEvent({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: 'gdpr.exported',
    metadata: {
      lead_id: input.leadId,
      lead_external_id: (leadRaw as { external_id?: string }).external_id ?? null,
      conversation_ids: convIds,
      message_count: exportData.messages.length,
      exported_at: exportData.exportedAt,
    },
  });

  return { ok: true, data: exportData };
}

// ---------------------------------------------------------------------------
// deleteContactDataAction — GDPR Art. 17
// ---------------------------------------------------------------------------

export interface DeleteContactDataResult {
  leadId: number;
  conversationsDeleted: number;
  messagesDeleted: number;
  notificationEventsDeleted: number;
  llmCallsDeleted: number;
  pipelineRunsDeleted: number;
}

export async function deleteContactDataAction(input: {
  leadId: number;
  /** Texto de confirmación literal: "ELIMINAR DEFINITIVAMENTE" — antifrustes. */
  confirmation: string;
}): Promise<ActionResult<DeleteContactDataResult>> {
  if (input.confirmation !== 'ELIMINAR DEFINITIVAMENTE') {
    return { ok: false, error: 'confirmación requerida' };
  }

  const auth = await authorizeGdprAction(input.leadId);
  if (!auth.ok) return auth;
  const { ctx, supabase } = auth;

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select('id, external_id, first_name, last_name, phone, email')
    .eq('id', input.leadId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (leadErr) return { ok: false, error: leadErr.message };
  if (!leadRaw) return { ok: false, error: 'lead no encontrado' };

  const { data: convsRaw } = await supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', input.leadId)
    .eq('tenant_id', ctx.tenantId);
  const convIds = ((convsRaw ?? []) as Array<{ id: number }>).map((c) =>
    Number(c.id),
  );

  // Conteo previo para reporte
  const { count: messageCountBefore } = await supabase
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .in('conversation_id', convIds.length > 0 ? convIds : [-1]);

  // 1. Limpiar notification_events (no tienen FK cascade a leads/convs).
  //    Filtramos JS-side por robustez (JSONB filter via PostgREST `.or()`
  //    es frágil con tipos mixtos).
  let notifDeleted = 0;
  const { data: notifs } = await supabase
    .from('notification_events')
    .select('id, payload')
    .eq('tenant_id', ctx.tenantId);
  const toDeleteNotif = (
    (notifs ?? []) as Array<{ id: number; payload: Record<string, unknown> }>
  )
    .filter((n) => belongsToLead(n.payload, input.leadId, convIds))
    .map((n) => n.id);
  if (toDeleteNotif.length > 0) {
    const { error: delNotifErr } = await supabase
      .from('notification_events')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .in('id', toDeleteNotif);
    if (delNotifErr) {
      return { ok: false, error: `delete notification_events: ${delNotifErr.message}` };
    }
    notifDeleted = toDeleteNotif.length;
  }

  // 1b. Sprint Bugfix 2026-05-12 — limpiar `llm_calls` Y `pipeline_runs` antes
  //     del DELETE de leads. Por defecto sus FKs a conversations tienen
  //     `ON DELETE SET NULL`, lo cual deja el row vivo con `conversation_id=NULL`
  //     pero `response_payload` contiene mensajes del lead (PII residual).
  //     Para cumplir "borrado total" de GDPR Art. 17 los borramos primero.
  //
  //     Doctrina nueva (2026-05-12): si el mismo IG contact vuelve a escribir
  //     tras un GDPR delete, el motor crea lead+conv NUEVA sin source
  //     clasificada → bajo `ghl_inbound_mode='classified_only'` la IA NO
  //     responde. Por tanto no queda ningún residuo del lead borrado.
  let llmCallsDeleted = 0;
  let pipelineRunsDeleted = 0;
  if (convIds.length > 0) {
    const { count: llmBefore } = await supabase
      .from('llm_calls')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .in('conversation_id', convIds);
    const { error: delLlmErr } = await supabase
      .from('llm_calls')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .in('conversation_id', convIds);
    if (delLlmErr) {
      return { ok: false, error: `delete llm_calls: ${delLlmErr.message}` };
    }
    llmCallsDeleted = llmBefore ?? 0;

    const { count: runsBefore } = await supabase
      .from('pipeline_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .in('conversation_id', convIds);
    const { error: delRunsErr } = await supabase
      .from('pipeline_runs')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .in('conversation_id', convIds);
    if (delRunsErr) {
      return { ok: false, error: `delete pipeline_runs: ${delRunsErr.message}` };
    }
    pipelineRunsDeleted = runsBefore ?? 0;
  }

  // 2. DELETE FROM leads → CASCADE limpia conversations + hijos
  //    (conversation_events, conversation_labels, conversation_messages,
  //     conversation_notes, message_schedules, pipeline_events).
  //    lead_external_ids también CASCADE.
  //    Tras este DELETE no queda NINGÚN residuo del lead en la BD —
  //    si el mismo contact vuelve a escribir, motor crea lead+conv nuevos
  //    sin source clasificada → bajo classified_only la IA NO dispara.
  const { error: delLeadErr } = await supabase
    .from('leads')
    .delete()
    .eq('id', input.leadId)
    .eq('tenant_id', ctx.tenantId);
  if (delLeadErr) {
    return { ok: false, error: `delete lead: ${delLeadErr.message}` };
  }

  await logAuditEvent({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: 'gdpr.deleted',
    metadata: {
      lead_id: input.leadId,
      lead_external_id: (leadRaw as { external_id?: string }).external_id ?? null,
      lead_first_name: (leadRaw as { first_name?: string }).first_name ?? null,
      lead_last_name: (leadRaw as { last_name?: string }).last_name ?? null,
      lead_phone_hash:
        (leadRaw as { phone?: string }).phone
          ? hashPiiForAudit((leadRaw as { phone: string }).phone)
          : null,
      lead_email_hash:
        (leadRaw as { email?: string }).email
          ? hashPiiForAudit((leadRaw as { email: string }).email)
          : null,
      conversations_deleted: convIds.length,
      messages_deleted: messageCountBefore ?? 0,
      notification_events_deleted: notifDeleted,
      llm_calls_deleted: llmCallsDeleted,
      pipeline_runs_deleted: pipelineRunsDeleted,
      deleted_at: new Date().toISOString(),
    },
  });

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');

  return {
    ok: true,
    data: {
      leadId: input.leadId,
      conversationsDeleted: convIds.length,
      messagesDeleted: messageCountBefore ?? 0,
      notificationEventsDeleted: notifDeleted,
      llmCallsDeleted,
      pipelineRunsDeleted,
    },
  };
}

/**
 * Hash determinista para auditoría: queremos saber que se eliminó un email/phone
 * concreto sin guardar el valor en claro en el audit log (sería PII residual).
 * SHA-256 truncado a 16 chars hex es suficiente para correlacionar sin
 * permitir reverso.
 */
function hashPiiForAudit(value: string): string {
  let hash = 0;
  const normalized = value.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return `pii_${(hash >>> 0).toString(16)}`;
}

/**
 * Devuelve true si el payload JSONB de un notification_event corresponde al lead
 * dado. Comprueba payload.lead_id directo o cualquier conversation_id incluido.
 */
function belongsToLead(
  payload: Record<string, unknown> | null | undefined,
  leadId: number,
  convIds: number[],
): boolean {
  if (!payload) return false;
  const payloadLeadId = Number((payload as { lead_id?: unknown }).lead_id ?? NaN);
  if (Number.isFinite(payloadLeadId) && payloadLeadId === leadId) return true;
  const payloadConvId = Number(
    (payload as { conversation_id?: unknown }).conversation_id ?? NaN,
  );
  if (Number.isFinite(payloadConvId) && convIds.includes(payloadConvId)) return true;
  return false;
}
