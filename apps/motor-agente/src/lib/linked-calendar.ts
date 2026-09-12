import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ¿Tiene el tenant algún calendario GHL vinculado y activo?
 *
 * Decide quién manda sobre F7 (2026-09-12): con calendario vinculado, la cita la
 * confirma el calendario (webhook AppointmentCreate o calendar-sync) y es el
 * applier quien mueve la conversación a F7. Sin calendario no hay otra fuente de
 * verdad y se respeta lo que decida el modelo.
 *
 * Best-effort: ante error de consulta devuelve false (se respeta al modelo).
 */
export async function tenantHasLinkedCalendar(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('calendar_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
