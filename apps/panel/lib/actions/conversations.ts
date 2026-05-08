'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
export async function togglePauseConversation(
  conversationId: number,
  currentlyPaused: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'unauthenticated' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return { ok: false, error: 'profile_without_tenant' };
  }

  const newValue = currentlyPaused ? null : 'infinity';

  const { error } = await supabase
    .from('conversations')
    .update({
      ai_paused_until: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', profile.tenant_id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/conversations');
  return { ok: true };
}
