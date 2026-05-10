'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Server Actions para `tenant_configs.wa_inbound_mode` (Hito 10 sub-fase 3).
 *
 * 3 modos posibles:
 *   - 'all':       cualquier mensaje WA inbound activa la IA (default backwards-compat).
 *   - 'form_only': solo si el lead ya tiene conversación con
 *                  conversation_source='bienvenida' (vino por
 *                  /automations/lead-form). Lead frío inbound → silenciado.
 *   - 'keyword':   form-origin SIEMPRE pasa, además leads frescos cuyo primer
 *                  mensaje matchea alguna automation_keywords type='wa_open'.
 *                  El resto → silenciado.
 *
 * Switch a 'keyword' rechaza si el tenant no tiene ≥1 keyword activa de
 * type='wa_open' — proteger al trainer de bloquear todo sin querer.
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type WaInboundMode = 'form_only' | 'all' | 'keyword';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const VALID_MODES: readonly WaInboundMode[] = ['form_only', 'all', 'keyword'];

interface GetResult {
  mode: WaInboundMode;
  waOpenKeywordCount: number;
}

export async function getWaInboundMode(): Promise<ActionResult<GetResult>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();

  const [configRes, kwRes] = await Promise.all([
    supabase
      .from('tenant_configs')
      .select('wa_inbound_mode')
      .eq('tenant_id', effective.tenantId)
      .maybeSingle(),
    supabase
      .from('automation_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', effective.tenantId)
      .eq('type', 'wa_open')
      .eq('is_active', true),
  ]);

  if (configRes.error) return { ok: false, error: configRes.error.message };

  const raw = (configRes.data as { wa_inbound_mode?: unknown } | null)?.wa_inbound_mode;
  const mode: WaInboundMode = (VALID_MODES as readonly string[]).includes(String(raw))
    ? (raw as WaInboundMode)
    : 'all';

  return {
    ok: true,
    data: {
      mode,
      waOpenKeywordCount: kwRes.count ?? 0,
    },
  };
}

export async function setWaInboundMode(mode: WaInboundMode): Promise<ActionResult> {
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: 'modo inválido' };
  }

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!effective.isAgencyAdmin && effective.role !== 'owner') {
    return { ok: false, error: 'forbidden — solo el owner puede cambiar el modo WA inbound' };
  }

  const supabase = getServiceRoleClient();

  // Guard: si modo='keyword' y no hay ≥1 keyword wa_open activa, rechazar.
  if (mode === 'keyword') {
    const { count, error: kwError } = await supabase
      .from('automation_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', effective.tenantId)
      .eq('type', 'wa_open')
      .eq('is_active', true);
    if (kwError) return { ok: false, error: kwError.message };
    if ((count ?? 0) < 1) {
      return {
        ok: false,
        error:
          'Antes de activar el modo "keyword" debes crear al menos 1 keyword tipo wa_open en /keywords. Si no, todos los inbound WA quedarán silenciados.',
      };
    }
  }

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
      .update({ wa_inbound_mode: mode })
      .eq('tenant_id', effective.tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('tenant_configs')
      .insert({ tenant_id: effective.tenantId, wa_inbound_mode: mode });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/settings/whatsapp');
  return { ok: true };
}
