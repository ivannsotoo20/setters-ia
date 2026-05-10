'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getWidgetDef, type WidgetFilter } from '@/lib/widget-catalog';
import type { ChannelKey } from '@/lib/dashboard-query';

/**
 * Sprint Lambda.2 — Server Actions para dashboard_widgets (per-tenant).
 *
 * Auth:
 *   - listWidgets: cualquier rol del tenant + agency admin (lectura).
 *   - createWidget / deleteWidget / reorderWidgets: admin+ (no viewer).
 *
 * El reordenamiento se ejecuta en una transacción simple (UPDATE batch). En
 * caso de fallo parcial, el client puede volver a llamar para reconstruir.
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

export interface WidgetRow {
  id: number;
  metricKey: string;
  filter: WidgetFilter;
  position: number;
}

const VALID_CHANNELS: readonly ChannelKey[] = ['wa', 'fb', 'ig-in', 'ig-out'];

function isAdminOrAbove(eff: { isAgencyAdmin: boolean; role: string }): boolean {
  return eff.isAgencyAdmin || eff.role === 'owner' || eff.role === 'admin';
}

function normalizeFilter(raw: unknown): WidgetFilter {
  if (!raw || typeof raw !== 'object') return {};
  const out: WidgetFilter = {};
  const obj = raw as Record<string, unknown>;
  if (typeof obj.channel === 'string' && (VALID_CHANNELS as readonly string[]).includes(obj.channel)) {
    out.channel = obj.channel as ChannelKey;
  }
  return out;
}

export async function listWidgets(): Promise<ActionResult<WidgetRow[]>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .select('id, metric_key, filter_json, position')
    .eq('tenant_id', eff.tenantId)
    .order('position', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows: WidgetRow[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    metricKey: String(r.metric_key),
    filter: normalizeFilter(r.filter_json),
    position: Number(r.position),
  }));
  return { ok: true, data: rows };
}

export interface CreateWidgetInput {
  metricKey: string;
  filter?: WidgetFilter;
}

export async function createWidget(
  input: CreateWidgetInput,
): Promise<ActionResult<{ id: number }>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden añadir widgets' };
  }

  const def = getWidgetDef(input.metricKey);
  if (!def) return { ok: false, error: 'metric_key inválida (no está en el catálogo)' };

  const filter = normalizeFilter(input.filter);

  const supabase = getServiceRoleClient();
  // Calcular siguiente position
  const { data: maxRow } = await supabase
    .from('dashboard_widgets')
    .select('position')
    .eq('tenant_id', eff.tenantId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = maxRow ? Number(maxRow.position) + 1 : 0;

  const { data, error } = await supabase
    .from('dashboard_widgets')
    .insert({
      tenant_id: eff.tenantId,
      metric_key: input.metricKey,
      filter_json: filter,
      position: nextPos,
      created_by: eff.userId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/dashboard');
  return { ok: true, data: { id: Number(data.id) } };
}

export async function deleteWidget(widgetId: number): Promise<ActionResult> {
  if (!Number.isFinite(widgetId) || widgetId <= 0) {
    return { ok: false, error: 'invalid widgetId' };
  }
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden eliminar widgets' };
  }

  const supabase = getServiceRoleClient();
  const { data: existing } = await supabase
    .from('dashboard_widgets')
    .select('tenant_id')
    .eq('id', widgetId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'widget no encontrado' };
  if (Number(existing.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  const { error } = await supabase.from('dashboard_widgets').delete().eq('id', widgetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function reorderWidgets(orderedIds: number[]): Promise<ActionResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!isAdminOrAbove(eff)) {
    return { ok: false, error: 'forbidden — solo admin u owner pueden reordenar' };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds vacío' };
  }

  const supabase = getServiceRoleClient();
  // Verificar que todos los ids pertenecen al tenant
  const { data: existing } = await supabase
    .from('dashboard_widgets')
    .select('id, tenant_id')
    .in('id', orderedIds);
  for (const w of existing ?? []) {
    if (Number(w.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
      return { ok: false, error: 'forbidden — uno o más widgets no pertenecen al tenant' };
    }
  }
  if ((existing ?? []).length !== orderedIds.length) {
    return { ok: false, error: 'algunos ids no existen' };
  }

  // Update batch (1 UPDATE por widget — N pequeño, 7-20 max)
  const updates = orderedIds.map(async (id, idx) =>
    supabase
      .from('dashboard_widgets')
      .update({ position: idx, updated_at: new Date().toISOString() })
      .eq('id', id),
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) return { ok: false, error: r.error.message };
  }

  revalidatePath('/dashboard');
  return { ok: true };
}
