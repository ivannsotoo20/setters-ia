'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server Actions para `automation_keywords` — patrones que clasifican mensajes
 * outbound del trainer en bienvenida / lead-magnet / inbound auto-response.
 *
 * RLS protege la tabla por tenant_id (las policies filtran por
 * tenant_id_for_user()). Aquí usamos el cliente con anon key + cookie del
 * usuario, así que RLS aplica automáticamente.
 */

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data, error } = await supabase
    .from('automation_keywords')
    .select('id, type, pattern, is_active, created_at, updated_at')
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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return { ok: false, error: 'profile sin tenant' };

  const { data, error } = await supabase
    .from('automation_keywords')
    .insert({
      tenant_id: profile.tenant_id,
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await supabase
    .from('automation_keywords')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', keywordId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/keywords');
  return { ok: true };
}

export async function deleteKeyword(keywordId: number): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await supabase
    .from('automation_keywords')
    .delete()
    .eq('id', keywordId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/keywords');
  return { ok: true };
}
