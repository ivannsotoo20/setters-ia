'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

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
