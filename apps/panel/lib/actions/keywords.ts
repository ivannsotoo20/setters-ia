'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Server Actions para `automation_keywords` — patrones que clasifican mensajes
 * outbound del trainer en bienvenida / lead-magnet / inbound auto-response.
 *
 * Usa service role + check explícito de tenant_id para soportar impersonate
 * (un agency admin viendo el panel como otro tenant escribe sus keywords).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type KeywordType = 'bienvenida' | 'lm' | 'inbound';

export interface KeywordRow {
  id: number;
  type: KeywordType;
  pattern: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function listKeywords(): Promise<ActionResult<KeywordRow[]>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('automation_keywords')
    .select('id, type, pattern, is_active, created_at, updated_at')
    .eq('tenant_id', effective.tenantId)
    .order('type', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };

  type RawRow = {
    id: number;
    type: string;
    pattern: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };

  const rows = (data as RawRow[])
    .filter((r): r is RawRow & { type: KeywordType } =>
      r.type === 'bienvenida' || r.type === 'lm' || r.type === 'inbound',
    )
    .map((r) => ({
      id: r.id,
      type: r.type,
      pattern: r.pattern,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

  return { ok: true, data: rows };
}

export async function createKeyword(input: {
  type: KeywordType;
  pattern: string;
}): Promise<ActionResult<{ id: number }>> {
  if (!input.pattern || input.pattern.trim().length === 0) {
    return { ok: false, error: 'pattern no puede estar vacío' };
  }
  if (!['bienvenida', 'lm', 'inbound'].includes(input.type)) {
    return { ok: false, error: 'type inválido' };
  }

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('automation_keywords')
    .insert({
      tenant_id: effective.tenantId,
      type: input.type,
      pattern: input.pattern.trim(),
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/keywords');
  return { ok: true, data: { id: Number(data.id) } };
}

export async function toggleKeywordActive(
  keywordId: number,
  active: boolean,
): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('automation_keywords')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', keywordId)
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/keywords');
  return { ok: true };
}

export async function deleteKeyword(keywordId: number): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('automation_keywords')
    .delete()
    .eq('id', keywordId)
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/keywords');
  return { ok: true };
}
