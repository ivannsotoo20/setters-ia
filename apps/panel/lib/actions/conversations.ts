'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

export type ConversationActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Pausa o reactiva la IA en una conversación. Operación idempotente:
 *   - Pausar  → `ai_paused_until = 'infinity'` (gate `process-debounced.ts:1.5`
 *               y `routeGhlInbound:6` saltean cualquier nuevo turno IA).
 *   - Reactivar → `ai_paused_until = NULL`.
 *
 * Doble check de tenant_id en BD: solo el dueño del conversation puede
 * tocarlo (RLS policies lo refuerzan también, pero filtrar aquí da error
 * más claro y evita una roundtrip si el conversation_id es de otro tenant).
 *
 * Vinculado al "Path A" decidido 2026-05-08: la pausa primaria viene de la
 * App Marketplace GHL (real-time outbound humano detection); este botón
 * es el failsafe manual desde panel.
 */
function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function togglePauseConversation(
  conversationId: number,
  currentlyPaused: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const newValue = currentlyPaused ? null : 'infinity';

  // Usamos service role para soportar el flujo impersonate (RLS bloquearía
  // un agency admin impersonando otro tenant). Validamos tenant_id en código.
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversations')
    .update({
      ai_paused_until: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/conversations');
  revalidatePath(`/conversations/${conversationId}`);
  return { ok: true };
}

// ===========================================================================
// Sprint Zeta — acciones panel chat
// ===========================================================================

interface AuthorizedConvCtx {
  userId: string;
  email: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  role: 'owner' | 'admin' | 'viewer';
}

async function requireConvAccess(
  conversationId: number,
): Promise<{ ok: true; ctx: AuthorizedConvCtx } | { ok: false; error: string }> {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversation not found' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  // Email del actor para audit trail
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', eff.userId)
    .maybeSingle();

  return {
    ok: true,
    ctx: {
      userId: eff.userId,
      email: String(profile?.email ?? ''),
      tenantId: Number(conv.tenant_id),
      isAgencyAdmin: eff.isAgencyAdmin,
      role: eff.role,
    },
  };
}

function revalidateConv(id: number) {
  revalidatePath('/conversations');
  revalidatePath(`/conversations/${id}`);
}

// ---- markUnread / markRead -----------------------------------------------

export async function setConversationUnread(
  conversationId: number,
  unread: boolean,
): Promise<ConversationActionResult> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversations')
    .update({ is_unread: unread, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidateConv(conversationId);
  return { ok: true };
}

// ---- block / unblock ------------------------------------------------------

export async function setConversationBlocked(
  conversationId: number,
  blocked: boolean,
): Promise<ConversationActionResult> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;
  if (!auth.ctx.isAgencyAdmin && auth.ctx.role !== 'owner') {
    return { ok: false, error: 'forbidden — solo el owner puede bloquear' };
  }

  const supabase = getServiceRoleClient();
  const patch: { is_blocked: boolean; updated_at: string; ai_paused_until?: string | null } = {
    is_blocked: blocked,
    updated_at: new Date().toISOString(),
  };
  // Bloquear implica pausar IA defensivamente.
  if (blocked) patch.ai_paused_until = 'infinity';

  const { error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidateConv(conversationId);
  return { ok: true };
}

// ---- assign --------------------------------------------------------------

export async function assignConversation(
  conversationId: number,
  assigneeUserId: string | null,
): Promise<ConversationActionResult> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  // Validar que el assignee es miembro del tenant si no es null
  if (assigneeUserId) {
    const supabase = getServiceRoleClient();
    const { data: target } = await supabase
      .from('profiles')
      .select('tenant_id, is_active')
      .eq('id', assigneeUserId)
      .maybeSingle();
    if (!target || target.is_active === false) {
      return { ok: false, error: 'usuario asignado no válido' };
    }
    if (Number(target.tenant_id) !== auth.ctx.tenantId) {
      return { ok: false, error: 'usuario no pertenece a esta sub-cuenta' };
    }
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversations')
    .update({
      assigned_user_id: assigneeUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidateConv(conversationId);
  return { ok: true };
}

// ---- notes ---------------------------------------------------------------

export interface ConversationNote {
  id: number;
  authorEmail: string | null;
  content: string;
  createdAt: string;
}

export async function addConversationNote(
  conversationId: number,
  content: string,
): Promise<ConversationActionResult<{ id: number }>> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  const trimmed = content?.trim() ?? '';
  if (!trimmed) return { ok: false, error: 'nota vacía' };
  if (trimmed.length > 4000) return { ok: false, error: 'nota >4000 chars' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('conversation_notes')
    .insert({
      conversation_id: conversationId,
      tenant_id: auth.ctx.tenantId,
      author_user_id: auth.ctx.userId,
      author_email: auth.ctx.email || null,
      content: trimmed,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };
  revalidateConv(conversationId);
  return { ok: true, data: { id: Number(data.id) } };
}

export async function deleteConversationNote(
  conversationId: number,
  noteId: number,
): Promise<ConversationActionResult> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', noteId)
    .eq('conversation_id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidateConv(conversationId);
  return { ok: true };
}

export async function listConversationNotes(
  conversationId: number,
): Promise<ConversationActionResult<ConversationNote[]>> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('conversation_notes')
    .select('id, author_email, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: Number(r.id),
      authorEmail: r.author_email as string | null,
      content: String(r.content),
      createdAt: String(r.created_at),
    })),
  };
}

// ---- delete (soft: state=closed + is_blocked) ----------------------------

export async function deleteConversation(
  conversationId: number,
): Promise<ConversationActionResult> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;
  if (!auth.ctx.isAgencyAdmin && auth.ctx.role !== 'owner') {
    return { ok: false, error: 'forbidden — solo el owner puede eliminar' };
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('conversations')
    .update({
      state: 'closed',
      is_blocked: true,
      ai_paused_until: 'infinity',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidateConv(conversationId);
  return { ok: true };
}

// ---- sendManualMessage (envío manual desde el composer del panel) ---------

const MAX_MANUAL_MESSAGE_LENGTH = 4000;

export async function sendManualMessage(
  conversationId: number,
  content: string,
): Promise<ConversationActionResult<{ messageId: number; providerMessageId: string | null }>> {
  const auth = await requireConvAccess(conversationId);
  if (!auth.ok) return auth;

  // viewer no puede enviar; owner/admin/agency_admin sí.
  if (!auth.ctx.isAgencyAdmin && auth.ctx.role === 'viewer') {
    return { ok: false, error: 'forbidden — viewer no puede enviar mensajes' };
  }

  const trimmed = content?.trim() ?? '';
  if (!trimmed) return { ok: false, error: 'mensaje vacío' };
  if (trimmed.length > MAX_MANUAL_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `mensaje demasiado largo (>${MAX_MANUAL_MESSAGE_LENGTH} chars)`,
    };
  }

  const supabase = getServiceRoleClient();

  // Verificar que la conversation NO esté bloqueada (bloqueo = sin envíos manuales).
  const { data: convCheck, error: convCheckErr } = await supabase
    .from('conversations')
    .select('is_blocked')
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId)
    .maybeSingle();
  if (convCheckErr) return { ok: false, error: convCheckErr.message };
  if (convCheck?.is_blocked === true) {
    return { ok: false, error: 'conversación bloqueada — desbloquea primero' };
  }

  // Lazy import del helper de envío para no cargar adapters en cold-start
  // de páginas que no envían (lista, detalle simple, etc).
  const { sendManualMessageDirect } = await import('../manual-send');

  let providerMessageId: string | null = null;
  try {
    const sendResult = await sendManualMessageDirect({
      supabase,
      conversationId,
      text: trimmed,
    });
    providerMessageId = sendResult.providerMessageId;
  } catch (err) {
    return {
      ok: false,
      error: `envío al proveedor falló: ${(err as Error).message}`,
    };
  }

  // INSERT mensaje human + UPDATE auto-pause IA en una transacción lógica.
  // En Supabase no hay transacciones reales sin PL/pgSQL; hacemos best-effort
  // con un INSERT seguido de UPDATE. Si falla el UPDATE el mensaje queda
  // visible y el usuario puede pausar manualmente.
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('conversation_messages')
    .insert({
      tenant_id: auth.ctx.tenantId,
      conversation_id: conversationId,
      source: 'human',
      content_type: 'text',
      content: trimmed,
      sent_at: nowIso,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: `mensaje enviado al proveedor pero no se pudo guardar en BD: ${insertErr?.message ?? 'unknown'}`,
    };
  }

  // Auto-pausa IA — el envío manual implica que el humano toma el control.
  await supabase
    .from('conversations')
    .update({
      ai_paused_until: 'infinity',
      last_message_at: nowIso,
      is_unread: false,
      updated_at: nowIso,
    })
    .eq('id', conversationId)
    .eq('tenant_id', auth.ctx.tenantId);

  revalidateConv(conversationId);
  return {
    ok: true,
    data: { messageId: Number(inserted.id), providerMessageId },
  };
}
