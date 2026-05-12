'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Server Actions para `tenant_configs.ghl_inbound_mode` (Sprint B 2026-05-12).
 *
 * 2 modos posibles:
 *   - 'classified_only' (DEFAULT NUEVO):
 *       IA solo dispara si la conversación tiene `conversation_source` ya
 *       calificado (`bienvenida`, `lm`, `inbound`, `manual`). Si un familiar /
 *       amigo / random escribe a la página IG sin matchear ningún workflow
 *       GHL, la conv se crea pero `ai_paused_until='infinity'` → pipeline NO
 *       dispara. Trainer decide a mano si quiere intervenir.
 *   - 'all' (legacy escape hatch):
 *       Cualquier inbound IG/FB via webhook OAuth o workflow custom activa IA.
 *       Comportamiento previo a la doctrina 2026-05-12. Solo se usa para
 *       volver atrás temporalmente.
 *
 * Nota: a diferencia de WA inbound mode, GHL no expone modo 'keyword' porque
 * los workflows GHL ya gestionan la clasificación por keywords del lado de
 * GHL (Comentario en post → DM → Webhook con customData.conversationSource).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type GhlInboundMode = 'classified_only' | 'all';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const VALID_MODES: readonly GhlInboundMode[] = ['classified_only', 'all'];

interface GetResult {
  mode: GhlInboundMode;
}

export async function getGhlInboundMode(): Promise<ActionResult<GetResult>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('ghl_inbound_mode')
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const raw = (data as { ghl_inbound_mode?: unknown } | null)?.ghl_inbound_mode;
  const mode: GhlInboundMode = (VALID_MODES as readonly string[]).includes(String(raw))
    ? (raw as GhlInboundMode)
    : 'classified_only';

  return { ok: true, data: { mode } };
}

export async function setGhlInboundMode(mode: GhlInboundMode): Promise<ActionResult> {
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: 'modo inválido' };
  }

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!effective.isAgencyAdmin && effective.role !== 'owner') {
    return {
      ok: false,
      error: 'forbidden — solo el owner puede cambiar el modo GHL inbound',
    };
  }

  const supabase = getServiceRoleClient();

  // Upsert tenant_configs row si no existe.
  const { data: existing, error: selectError } = await supabase
    .from('tenant_configs')
    .select('tenant_id')
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();
  if (selectError) return { ok: false, error: selectError.message };

  if (existing) {
    const { error } = await supabase
      .from('tenant_configs')
      .update({ ghl_inbound_mode: mode })
      .eq('tenant_id', effective.tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('tenant_configs')
      .insert({ tenant_id: effective.tenantId, ghl_inbound_mode: mode });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/settings/integrations');
  return { ok: true };
}
