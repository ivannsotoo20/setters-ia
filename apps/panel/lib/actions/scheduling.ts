'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { isValidIanaTimezone } from '@/lib/trainer-prefs-serializer';

/**
 * Hito 11 — Server actions para la configuración del modo de agendado del
 * setter IA y la zona horaria del trainer. Persisten en
 * `trainer_preferences.preferences` (JSONB merge — NO pisa otras claves).
 *
 * Auth: agency admin o owner. Viewer NO puede modificar.
 */

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export type SchedulingMode = 'direct' | 'link';

export interface SchedulingConfig {
  schedulingMode: 'direct' | 'link' | null;
  trainerTimezone: string | null;
}

/** Lee la config actual del trainer (modo + timezone). */
export async function loadSchedulingConfig(): Promise<ActionResult<SchedulingConfig>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const rawMode = prefs.schedulingMode;
  const schedulingMode: 'direct' | 'link' | null =
    rawMode === 'direct' || rawMode === 'link' ? (rawMode as 'direct' | 'link') : null;
  const rawTz = prefs.trainerTimezone;
  const trainerTimezone =
    typeof rawTz === 'string' && rawTz.trim() !== '' ? rawTz.trim() : null;

  return { ok: true, data: { schedulingMode, trainerTimezone } };
}

/** Persiste el modo de agendado. */
export async function setSchedulingMode(mode: SchedulingMode): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede cambiar el modo de agendado' };
  }
  if (mode !== 'direct' && mode !== 'link') {
    return { ok: false, error: 'mode debe ser "direct" o "link"' };
  }

  const supabase = getServiceRoleClient();

  // Asegura que existe el row (UPSERT por tenant_id). Merge JSONB para no
  // pisar otras claves.
  const { data: existing } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();

  const currentPrefs = (existing?.preferences ?? {}) as Record<string, unknown>;
  const nextPrefs = { ...currentPrefs, schedulingMode: mode };

  const { error } = existing
    ? await supabase
        .from('trainer_preferences')
        .update({ preferences: nextPrefs, updated_at: new Date().toISOString() })
        .eq('tenant_id', eff.tenantId)
    : await supabase
        .from('trainer_preferences')
        .insert({ tenant_id: eff.tenantId, preferences: nextPrefs });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/scheduling');
  // El sidebar lee la flag schedulingModeUnset → revalidamos el layout entero
  // del segmento (app) para que se rerendee con el badge actualizado.
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Persiste la timezone IANA del trainer. */
export async function setTrainerTimezone(tz: string): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede cambiar la zona horaria' };
  }
  if (!isValidIanaTimezone(tz)) {
    return { ok: false, error: 'Zona horaria IANA no válida' };
  }
  const trimmed = tz.trim();

  const supabase = getServiceRoleClient();

  const { data: existing } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();

  const currentPrefs = (existing?.preferences ?? {}) as Record<string, unknown>;
  const nextPrefs = { ...currentPrefs, trainerTimezone: trimmed };

  const { error } = existing
    ? await supabase
        .from('trainer_preferences')
        .update({ preferences: nextPrefs, updated_at: new Date().toISOString() })
        .eq('tenant_id', eff.tenantId)
    : await supabase
        .from('trainer_preferences')
        .insert({ tenant_id: eff.tenantId, preferences: nextPrefs });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/scheduling');
  return { ok: true };
}
