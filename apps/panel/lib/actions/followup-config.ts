'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import type { ActionResult } from './followups';

/**
 * Sprint Iota.1 — Server actions para tenant_followup_config (auto-followup).
 *
 * Lectura: cualquier miembro del tenant + agency admin.
 * Escritura: owner del tenant + agency admin (config sensible).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TenantFollowupConfigRow {
  enabled: boolean;
  windowStartHour: number;
  windowEndHour: number;
  windowTimezone: string;
  maxFollowupsPerLead: number;
  intervalsHours: number[];
  autoPersonalize: boolean;
  defaultFollowupText: string | null;
  materializeLookaheadHours: number;
}

export async function getTenantFollowupConfig(): Promise<
  ActionResult<TenantFollowupConfigRow>
> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_followup_config')
    .select(
      `enabled, window_start_hour, window_end_hour, window_timezone,
       max_followups_per_lead, intervals_hours,
       auto_personalize, default_followup_text, materialize_lookahead_hours`,
    )
    .eq('tenant_id', eff.tenantId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  if (!data) {
    return {
      ok: true,
      data: {
        enabled: false,
        windowStartHour: 9,
        windowEndHour: 21,
        windowTimezone: 'Europe/Madrid',
        maxFollowupsPerLead: 3,
        intervalsHours: [24, 72, 168],
        autoPersonalize: true,
        defaultFollowupText: 'Hola, ¿pudiste ver mi mensaje? Quería saber si sigues interesado/a 🙂',
        materializeLookaheadHours: 24,
      },
    };
  }

  return {
    ok: true,
    data: {
      enabled: Boolean(data.enabled),
      windowStartHour: Number(data.window_start_hour),
      windowEndHour: Number(data.window_end_hour),
      windowTimezone: String(data.window_timezone),
      maxFollowupsPerLead: Number(data.max_followups_per_lead),
      intervalsHours: Array.isArray(data.intervals_hours)
        ? (data.intervals_hours as number[])
        : [24, 72, 168],
      autoPersonalize: Boolean(data.auto_personalize),
      defaultFollowupText: (data.default_followup_text as string | null) ?? null,
      materializeLookaheadHours: Number(data.materialize_lookahead_hours ?? 24),
    },
  };
}

export interface UpdateFollowupConfigInput {
  enabled?: boolean;
  windowStartHour?: number;
  windowEndHour?: number;
  windowTimezone?: string;
  maxFollowupsPerLead?: number;
  intervalsHours?: number[];
  autoPersonalize?: boolean;
  defaultFollowupText?: string | null;
  materializeLookaheadHours?: number;
}

export async function updateTenantFollowupConfig(
  input: UpdateFollowupConfigInput,
): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede modificar config followups' };
  }

  // Validation
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.enabled !== undefined) updates.enabled = input.enabled === true;
  if (input.windowStartHour !== undefined) {
    const v = Number(input.windowStartHour);
    if (!Number.isInteger(v) || v < 0 || v > 23) {
      return { ok: false, error: 'window_start_hour fuera de rango [0, 23]' };
    }
    updates.window_start_hour = v;
  }
  if (input.windowEndHour !== undefined) {
    const v = Number(input.windowEndHour);
    if (!Number.isInteger(v) || v < 0 || v > 23) {
      return { ok: false, error: 'window_end_hour fuera de rango [0, 23]' };
    }
    updates.window_end_hour = v;
  }
  if (input.windowTimezone !== undefined) {
    const tz = String(input.windowTimezone).trim();
    if (!tz) return { ok: false, error: 'timezone vacío' };
    updates.window_timezone = tz;
  }
  if (input.maxFollowupsPerLead !== undefined) {
    const v = Number(input.maxFollowupsPerLead);
    if (!Number.isInteger(v) || v < 1 || v > 10) {
      return { ok: false, error: 'max_followups_per_lead fuera de rango [1, 10]' };
    }
    updates.max_followups_per_lead = v;
  }
  if (input.intervalsHours !== undefined) {
    if (!Array.isArray(input.intervalsHours) || input.intervalsHours.length === 0) {
      return { ok: false, error: 'intervals_hours debe ser array no vacío' };
    }
    if (input.intervalsHours.length > 10) {
      return { ok: false, error: 'máximo 10 intervalos' };
    }
    for (const h of input.intervalsHours) {
      const v = Number(h);
      if (!Number.isInteger(v) || v < 1 || v > 720) {
        return { ok: false, error: `intervalo ${h} inválido (esperado entero entre 1 y 720 horas)` };
      }
    }
    updates.intervals_hours = input.intervalsHours.map((h) => Number(h));
  }
  if (input.autoPersonalize !== undefined) {
    updates.auto_personalize = input.autoPersonalize === true;
  }
  if (input.defaultFollowupText !== undefined) {
    const t = (input.defaultFollowupText ?? '').trim();
    if (t.length > 4000) return { ok: false, error: 'default_followup_text demasiado largo (>4000)' };
    updates.default_followup_text = t.length > 0 ? t : null;
  }
  if (input.materializeLookaheadHours !== undefined) {
    const v = Number(input.materializeLookaheadHours);
    if (!Number.isInteger(v) || v < 0 || v > 168) {
      return { ok: false, error: 'materialize_lookahead_hours fuera de rango [0, 168]' };
    }
    updates.materialize_lookahead_hours = v;
  }

  const supabase = getServiceRoleClient();
  // Upsert en caso de que el row no existiera (defensivo)
  const { error } = await supabase
    .from('tenant_followup_config')
    .upsert(
      {
        tenant_id: eff.tenantId,
        ...updates,
      },
      { onConflict: 'tenant_id' },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/preferences');
  revalidatePath('/conversations');
  return { ok: true };
}
