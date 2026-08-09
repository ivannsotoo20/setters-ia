'use server';

/**
 * Interruptor global del setter (migration 074).
 *
 * Lo acciona el propio entrenador desde `/settings/preferences`. La idea es que
 * pueda frenar sin llamar a nadie: que el botón exista importa más por lo que
 * transmite que por las veces que se usa.
 *
 * Apagar NO desconecta. Los mensajes se siguen recibiendo y guardando, y las
 * conversaciones aparecen completas en el panel; lo único que no ocurre es que
 * el setter responda. Al reencender no se ha perdido ningún lead.
 */

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

export type AiSwitchResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

/** Lee el estado actual. Ante cualquier problema asume ENCENDIDO, igual que el motor. */
export async function getAiEnabled(): Promise<boolean> {
  const effective = await getEffectiveTenant();
  if (!effective) return true;

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('tenant_configs')
    .select('ai_enabled')
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();

  if (error || !data) return true;
  return (data as { ai_enabled?: unknown }).ai_enabled !== false;
}

/**
 * Enciende o apaga el setter del tenant efectivo.
 *
 * Permitido al owner del tenant y al agency admin. NO se restringe solo al
 * owner: si un miembro ve algo raro un sábado, el coste de que pueda parar es
 * mucho menor que el de que no pueda.
 */
export async function setAiEnabled(enabled: boolean): Promise<AiSwitchResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('tenant_configs')
    .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };

  // Queda registrado quién lo tocó: si mañana alguien pregunta por qué el setter
  // estuvo mudo tres horas, la respuesta tiene que estar en algún sitio.
  try {
    await admin.from('tenant_audit_log').insert({
      tenant_id: effective.tenantId,
      actor_user_id: effective.userId ?? null,
      action: enabled ? 'ai.enabled' : 'ai.disabled',
      metadata: { via: 'panel_switch', role: effective.role, impersonating: effective.isImpersonating },
    });
  } catch {
    // El log de auditoría no puede impedir que alguien apague el setter.
  }

  revalidatePath('/settings/preferences');
  revalidatePath('/dashboard');
  return { ok: true, enabled };
}
