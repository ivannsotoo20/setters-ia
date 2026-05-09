'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildComposedPrompt, type PromptBlockRow } from '@fyzon/prompt-composer';
import type { Database } from '@fyzon/db';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { writeBlockToSource } from '@/lib/prompt-source-writer';
import {
  serializeTrainerPreferences,
  parseTrainerPreferences,
  type TrainerPreferences,
} from '@/lib/trainer-prefs-serializer';

/**
 * Server actions del editor admin de prompts.
 *
 * Niveles de control:
 *   - Cerebro/Core (block_key globales, tenant_id IS NULL): solo agency admin.
 *   - Coach + admin_overrides (tenant_id=X): solo agency admin.
 *   - Trainer prefs (block_key='trainer_prefs_v1'): trainer del tenant o agency admin.
 *
 * Source-of-truth: BD (`prompt_blocks`). El .md fuente se reescribe best-effort
 * (warning si falla, no bloquea Apply).
 *
 * Plan: ~/.claude/plans/admin-edita-cerebro-coach-prefs-2026-05-09.md
 */

type SupabaseAdmin = SupabaseClient<Database>;

function getServiceRoleClient(): SupabaseAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface AdminAuthOk {
  ok: true;
  userId: string;
  isAgencyAdmin: true;
}
interface AuthFail {
  ok: false;
  error: string;
}

async function requireAgencyAdmin(): Promise<AdminAuthOk | AuthFail> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!eff.isAgencyAdmin) return { ok: false, error: 'forbidden: agency admin only' };
  return { ok: true, userId: eff.userId, isAgencyAdmin: true };
}

async function resolveTenantSlug(
  supabase: SupabaseAdmin,
  tenantId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();
  return data?.slug ?? null;
}

// ============================================================================
// loadActiveBlock — devuelve el bloque activo + draft del usuario actual (si existe)
// ============================================================================

export interface ActiveBlockResult {
  ok: true;
  block: {
    id: number;
    blockKey: string;
    tenantId: number | null;
    sortOrder: number;
    content: string;
    version: number;
    updatedAt: string;
    activeVersionNumber: number;
  } | null;
  draft: {
    id: number;
    content: string;
    baseVersion: number;
    updatedAt: string;
  } | null;
}

export async function loadActiveBlock(args: {
  blockKey: string;
  tenantId: number | null;
}): Promise<ActiveBlockResult | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  const blockQ = supabase
    .from('prompt_blocks')
    .select('id, block_key, tenant_id, sort_order, content, version, updated_at')
    .eq('block_key', args.blockKey)
    .eq('is_active', true)
    .eq('version', 1);
  const { data: blockData, error: blockErr } =
    args.tenantId == null
      ? await blockQ.is('tenant_id', null).maybeSingle()
      : await blockQ.eq('tenant_id', args.tenantId).maybeSingle();

  if (blockErr) return { ok: false, error: blockErr.message };

  let activeVersionNumber = 0;
  if (blockData) {
    const { data: lastVer } = await supabase
      .from('prompt_block_versions')
      .select('version_number')
      .eq('prompt_block_id', blockData.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    activeVersionNumber = lastVer?.version_number ?? 0;
  }

  const draftQuery = supabase
    .from('prompt_block_drafts')
    .select('id, content, base_version, updated_at')
    .eq('block_key', args.blockKey)
    .eq('owner_user_id', auth.userId);
  const { data: draftData, error: draftErr } =
    args.tenantId == null
      ? await draftQuery.is('tenant_id', null).maybeSingle()
      : await draftQuery.eq('tenant_id', args.tenantId).maybeSingle();

  if (draftErr) return { ok: false, error: draftErr.message };

  return {
    ok: true,
    block: blockData
      ? {
          id: blockData.id,
          blockKey: blockData.block_key,
          tenantId: blockData.tenant_id ?? null,
          sortOrder: blockData.sort_order,
          content: blockData.content,
          version: blockData.version,
          updatedAt: blockData.updated_at,
          activeVersionNumber,
        }
      : null,
    draft: draftData
      ? {
          id: draftData.id,
          content: draftData.content,
          baseVersion: draftData.base_version,
          updatedAt: draftData.updated_at,
        }
      : null,
  };
}

// ============================================================================
// saveDraft — autosave del editor
// ============================================================================

export async function saveDraft(args: {
  blockKey: string;
  tenantId: number | null;
  content: string;
  baseVersion: number;
}): Promise<{ ok: true; draftId: number } | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  if (typeof args.content !== 'string') return { ok: false, error: 'content must be string' };
  if (args.content.length > 200_000) {
    return { ok: false, error: 'content too large (>200k chars)' };
  }

  const supabase = getServiceRoleClient();

  // Manual SELECT → UPDATE/INSERT en lugar de UPSERT con onConflict.
  //
  // Razón: el UNIQUE constraint nativo (block_key, tenant_id, owner_user_id) NO
  // funciona en Postgres cuando tenant_id IS NULL (NULL ≠ NULL en UNIQUE), por
  // lo que migration 017 lo reemplazó por un UNIQUE INDEX con COALESCE. PostgREST
  // upsert con onConflict apunta a constraint name, no a index, así que el upsert
  // dejaría de funcionar para drafts globales (tenant_id=NULL → Cerebro). El
  // patrón manual es robusto independiente del constraint subyacente.
  const findQ = supabase
    .from('prompt_block_drafts')
    .select('id')
    .eq('block_key', args.blockKey)
    .eq('owner_user_id', auth.userId);
  const { data: existing, error: findErr } =
    args.tenantId == null
      ? await findQ.is('tenant_id', null).maybeSingle()
      : await findQ.eq('tenant_id', args.tenantId).maybeSingle();
  if (findErr) return { ok: false, error: `find draft failed: ${findErr.message}` };

  if (existing) {
    const { error: updErr } = await supabase
      .from('prompt_block_drafts')
      .update({
        content: args.content,
        base_version: args.baseVersion,
        // updated_at lo gestiona el trigger set_updated_at_now de migration 016.
      })
      .eq('id', existing.id);
    if (updErr) return { ok: false, error: `update draft failed: ${updErr.message}` };
    return { ok: true, draftId: existing.id };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('prompt_block_drafts')
    .insert({
      block_key: args.blockKey,
      tenant_id: args.tenantId,
      content: args.content,
      base_version: args.baseVersion,
      owner_user_id: auth.userId,
    })
    .select('id')
    .maybeSingle();
  if (insErr || !inserted) return { ok: false, error: insErr?.message ?? 'insert draft failed' };
  return { ok: true, draftId: inserted.id };
}

// ============================================================================
// discardDraft — borra el draft del usuario actual
// ============================================================================

export async function discardDraft(args: {
  blockKey: string;
  tenantId: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const q = supabase
    .from('prompt_block_drafts')
    .delete()
    .eq('block_key', args.blockKey)
    .eq('owner_user_id', auth.userId);
  const { error } =
    args.tenantId == null ? await q.is('tenant_id', null) : await q.eq('tenant_id', args.tenantId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================================
// previewComposed — compone el prompt completo sustituyendo bloques activos
// por sus drafts según el tenant elegido
// ============================================================================

export interface PreviewBlock {
  blockKey: string;
  chars: number;
  scope: 'shared' | 'tenant';
  cached: boolean;
  source: 'active' | 'draft';
}

export interface PreviewResult {
  ok: true;
  prompt: string;
  totalChars: number;
  blockCount: number;
  cacheBreakpoints: number;
  blocks: PreviewBlock[];
}

export async function previewComposed(args: {
  /** Tenant para el cual componer. Determina coach/overrides/prefs incluidos. */
  tenantId: number;
  /** Fase activa para incluir el fase_<N>_v4 correcto. */
  currentPhase: number;
  /**
   * Drafts a sustituir. Cada entry reemplaza el bloque activo correspondiente
   * (matching por block_key + tenantIdScope). Se aplican antes de componer.
   */
  draftOverrides?: Array<{
    blockKey: string;
    /** null = global. number = scoped a ese tenant. */
    tenantIdScope: number | null;
    content: string;
  }>;
}): Promise<PreviewResult | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  if (args.currentPhase < 1 || args.currentPhase > 6) {
    return { ok: false, error: 'currentPhase must be 1..6' };
  }

  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from('prompt_blocks')
    .select('block_key, content, sort_order, tenant_id')
    .eq('is_active', true)
    .eq('version', 1)
    .or(`tenant_id.is.null,tenant_id.eq.${args.tenantId}`);

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'no prompt_blocks found' };

  const rows: PromptBlockRow[] = data.map((r) => ({
    block_key: String(r.block_key),
    content: String(r.content),
    sort_order: Number(r.sort_order),
    tenant_id: r.tenant_id == null ? null : Number(r.tenant_id),
  }));

  // Mapeo block_key → contenido draft (separamos por scope para no pisar globales con drafts de tenant).
  const draftMap = new Map<string, string>();
  for (const d of args.draftOverrides ?? []) {
    const k = `${d.blockKey}|${d.tenantIdScope ?? 'NULL'}`;
    draftMap.set(k, d.content);
  }

  const finalRows = rows.map((r) => {
    const k = `${r.block_key}|${r.tenant_id ?? 'NULL'}`;
    const draftContent = draftMap.get(k);
    if (draftContent !== undefined) {
      return { ...r, content: draftContent };
    }
    return r;
  });

  // Si hay un draft de un block_key que NO existe activo aún (ej: admin_overrides_v1 nuevo),
  // lo añadimos como row sintética con sort_order=6 (overrides) o 110 (prefs).
  for (const d of args.draftOverrides ?? []) {
    const k = `${d.blockKey}|${d.tenantIdScope ?? 'NULL'}`;
    const exists = finalRows.some((r) => `${r.block_key}|${r.tenant_id ?? 'NULL'}` === k);
    if (!exists) {
      const sortOrder =
        d.blockKey === 'admin_overrides_v1' ? 6 : d.blockKey === 'trainer_prefs_v1' ? 110 : 999;
      finalRows.push({
        block_key: d.blockKey,
        content: d.content,
        sort_order: sortOrder,
        tenant_id: d.tenantIdScope,
      });
    }
  }

  let composed;
  try {
    composed = buildComposedPrompt(finalRows, {
      tenantId: args.tenantId,
      currentPhase: args.currentPhase,
    });
  } catch (err) {
    return { ok: false, error: `compose failed: ${(err as Error).message}` };
  }

  const blocks: PreviewBlock[] = composed.blocks.map((b) => ({
    blockKey: b.key,
    chars: b.text.length,
    scope: b.scope,
    cached: b.cached,
    source: draftMap.has(`${b.key}|${b.scope === 'shared' ? 'NULL' : args.tenantId}`)
      ? 'draft'
      : 'active',
  }));

  const prompt = composed.systemContent.map((s) => s.text).join('\n\n');

  return {
    ok: true,
    prompt,
    totalChars: composed.metadata.totalChars,
    blockCount: composed.metadata.blockCount,
    cacheBreakpoints: composed.metadata.cacheBreakpoints,
    blocks,
  };
}

// ============================================================================
// applyDraft — INSERT versions snapshot + UPDATE prompt_blocks + reescribir .md + DELETE draft
// ============================================================================

export interface ApplyResult {
  ok: true;
  blockId: number;
  newVersionNumber: number;
  mdSyncWarning?: string;
}

export async function applyDraft(args: {
  blockKey: string;
  tenantId: number | null;
  changeSummary?: string;
}): Promise<ApplyResult | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  // 1. Cargar el draft del usuario actual
  const draftQ = supabase
    .from('prompt_block_drafts')
    .select('id, content, base_version')
    .eq('block_key', args.blockKey)
    .eq('owner_user_id', auth.userId);
  const { data: draft, error: draftErr } =
    args.tenantId == null
      ? await draftQ.is('tenant_id', null).maybeSingle()
      : await draftQ.eq('tenant_id', args.tenantId).maybeSingle();

  if (draftErr) return { ok: false, error: draftErr.message };
  if (!draft) return { ok: false, error: 'no draft found for this block' };

  // 2. Cargar el active row (puede no existir si es un block_key nuevo, p.ej. admin_overrides_v1)
  const activeQ = supabase
    .from('prompt_blocks')
    .select('id, content, sort_order')
    .eq('block_key', args.blockKey)
    .eq('is_active', true)
    .eq('version', 1);
  const { data: active, error: activeErr } =
    args.tenantId == null
      ? await activeQ.is('tenant_id', null).maybeSingle()
      : await activeQ.eq('tenant_id', args.tenantId).maybeSingle();

  if (activeErr) return { ok: false, error: activeErr.message };

  let blockId: number;
  let newVersionNumber: number;

  if (active) {
    // 3a. Snapshot pre-edit + UPDATE
    const { data: lastVer } = await supabase
      .from('prompt_block_versions')
      .select('version_number')
      .eq('prompt_block_id', active.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    let currentVer = lastVer?.version_number ?? 0;

    // Auto-baseline (defensa en profundidad): si el bloque NO tiene ningún row
    // en prompt_block_versions, snapshoteamos el contenido actual como v1 ANTES
    // de aplicar el cambio. Así el contenido inicial queda preservado y no se
    // pierde con el primer Apply. (Edge case: bloques creados sin pasar por
    // applyDraft. Producción ya tiene baseline sembrado para los 12 bloques
    // existentes; este branch solo dispara para bloques nuevos creados sin
    // pasar por el editor.)
    if (currentVer === 0) {
      const { error: baseErr } = await supabase.from('prompt_block_versions').insert({
        prompt_block_id: active.id,
        version_number: 1,
        content: active.content,
        changed_by: auth.userId,
        change_summary: 'Auto-baseline (pre-first-edit snapshot)',
        was_applied: true,
      });
      if (baseErr) return { ok: false, error: `auto-baseline failed: ${baseErr.message}` };
      currentVer = 1;
    }

    // Conflict check: el draft fue creado contra una versión específica. Si
    // alguien aplicó otro cambio mientras tanto, currentVer habrá avanzado y
    // rechazamos para forzar reload.
    // Excepción: si el draft tenía base_version=0 y acabamos de auto-bumpear a
    // currentVer=1 (caso del baseline auto), aceptamos y consideramos que el
    // draft estaba contra v0 = baseline.
    const draftAcceptsAutoBaseline =
      draft.base_version === 0 && currentVer === 1 && lastVer == null;
    if (currentVer !== draft.base_version && !draftAcceptsAutoBaseline) {
      return {
        ok: false,
        error: `conflict: base_version=${draft.base_version} but current=${currentVer}. Reload the editor.`,
      };
    }

    newVersionNumber = currentVer + 1;

    const { error: insVerErr } = await supabase.from('prompt_block_versions').insert({
      prompt_block_id: active.id,
      version_number: newVersionNumber,
      content: draft.content,
      changed_by: auth.userId,
      change_summary: args.changeSummary ?? null,
      was_applied: true,
    });
    if (insVerErr) return { ok: false, error: `insert version failed: ${insVerErr.message}` };

    const { error: updErr } = await supabase
      .from('prompt_blocks')
      .update({
        content: draft.content,
        updated_at: new Date().toISOString(),
        created_by: auth.userId,
      })
      .eq('id', active.id);
    if (updErr) return { ok: false, error: `update prompt_blocks failed: ${updErr.message}` };

    blockId = active.id;
  } else {
    // 3b. INSERT row nueva (block_key inexistente, p.ej. primer admin_overrides_v1 del tenant)
    const sortOrder =
      args.blockKey === 'admin_overrides_v1' ? 6 : args.blockKey === 'trainer_prefs_v1' ? 110 : 999;

    const { data: insRow, error: insErr } = await supabase
      .from('prompt_blocks')
      .insert({
        block_key: args.blockKey,
        tenant_id: args.tenantId,
        content: draft.content,
        sort_order: sortOrder,
        version: 1,
        is_active: true,
        created_by: auth.userId,
      })
      .select('id')
      .maybeSingle();
    if (insErr || !insRow) return { ok: false, error: insErr?.message ?? 'insert failed' };

    newVersionNumber = 1;
    const { error: insVerErr } = await supabase.from('prompt_block_versions').insert({
      prompt_block_id: insRow.id,
      version_number: 1,
      content: draft.content,
      changed_by: auth.userId,
      change_summary: args.changeSummary ?? '(initial)',
      was_applied: true,
    });
    if (insVerErr) return { ok: false, error: `insert version failed: ${insVerErr.message}` };

    blockId = insRow.id;
  }

  // 4. Reescribir .md fuente (best-effort)
  let mdSyncWarning: string | undefined;
  if (args.blockKey !== 'trainer_prefs_v1') {
    const tenantSlug =
      args.tenantId != null ? (await resolveTenantSlug(supabase, args.tenantId)) ?? undefined : undefined;
    const writeResult = await writeBlockToSource({
      blockKey: args.blockKey,
      content: draft.content,
      tenantId: args.tenantId,
      tenantSlug,
    });
    if (!writeResult.ok) {
      mdSyncWarning = writeResult.error;
    }
  }

  // 5. DELETE draft
  await supabase.from('prompt_block_drafts').delete().eq('id', draft.id);

  // 6. Revalidate
  revalidatePath('/admin/cerebro');
  revalidatePath(`/admin/cerebro/${args.blockKey}`);
  if (args.tenantId != null) revalidatePath(`/admin/tenants/${args.tenantId}`);

  return { ok: true, blockId, newVersionNumber, mdSyncWarning };
}

// ============================================================================
// loadVersionContent — devuelve el contenido completo de una version específica
//
// Usado por el dropdown del editor: el usuario selecciona "v3 · 6/5/2026" y el
// textarea carga ESE contenido. NO toca BD (prompt_blocks sigue intacto). Si
// luego el usuario edita y guarda, se crea v(max+1) con el contenido del
// textarea — equivalente al "Restaurar" de antes pero como flujo natural.
// ============================================================================

export interface VersionContentResult {
  ok: true;
  versionNumber: number;
  content: string;
  changedAt: string;
  changedBy: string | null;
  changeSummary: string | null;
}

export async function loadVersionContent(args: {
  blockKey: string;
  tenantId: number | null;
  versionNumber: number;
}): Promise<VersionContentResult | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  const blockQ = supabase
    .from('prompt_blocks')
    .select('id')
    .eq('block_key', args.blockKey)
    .eq('is_active', true)
    .eq('version', 1);
  const { data: block, error: blockErr } =
    args.tenantId == null
      ? await blockQ.is('tenant_id', null).maybeSingle()
      : await blockQ.eq('tenant_id', args.tenantId).maybeSingle();
  if (blockErr) return { ok: false, error: blockErr.message };
  if (!block) return { ok: false, error: 'block not found' };

  const { data: ver, error: verErr } = await supabase
    .from('prompt_block_versions')
    .select('version_number, content, changed_at, changed_by, change_summary')
    .eq('prompt_block_id', block.id)
    .eq('version_number', args.versionNumber)
    .maybeSingle();
  if (verErr) return { ok: false, error: verErr.message };
  if (!ver) return { ok: false, error: `version v${args.versionNumber} not found` };

  return {
    ok: true,
    versionNumber: ver.version_number,
    content: ver.content,
    changedAt: ver.changed_at,
    changedBy: ver.changed_by,
    changeSummary: ver.change_summary,
  };
}

// ============================================================================
// listVersions — histórico de versiones de un bloque
// ============================================================================

export interface VersionRow {
  id: number;
  versionNumber: number;
  changedAt: string;
  changedBy: string | null;
  changeSummary: string | null;
  contentChars: number;
  wasApplied: boolean;
}

export async function listVersions(args: {
  blockKey: string;
  tenantId: number | null;
  limit?: number;
}): Promise<{ ok: true; versions: VersionRow[] } | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  const blockQ = supabase
    .from('prompt_blocks')
    .select('id')
    .eq('block_key', args.blockKey)
    .eq('is_active', true)
    .eq('version', 1);
  const { data: block, error: blockErr } =
    args.tenantId == null
      ? await blockQ.is('tenant_id', null).maybeSingle()
      : await blockQ.eq('tenant_id', args.tenantId).maybeSingle();
  if (blockErr) return { ok: false, error: blockErr.message };
  if (!block) return { ok: true, versions: [] };

  const { data, error } = await supabase
    .from('prompt_block_versions')
    .select('id, version_number, changed_at, changed_by, change_summary, content, was_applied')
    .eq('prompt_block_id', block.id)
    .order('version_number', { ascending: false })
    .limit(args.limit ?? 20);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    versions: (data ?? []).map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      changedAt: v.changed_at,
      changedBy: v.changed_by,
      changeSummary: v.change_summary,
      contentChars: v.content.length,
      wasApplied: v.was_applied,
    })),
  };
}

// ============================================================================
// restoreVersion — crea nueva versión con el contenido de una vieja
// ============================================================================

export async function restoreVersion(args: {
  versionId: number;
}): Promise<ApplyResult | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { data: ver, error: verErr } = await supabase
    .from('prompt_block_versions')
    .select('id, prompt_block_id, version_number, content')
    .eq('id', args.versionId)
    .maybeSingle();
  if (verErr) return { ok: false, error: verErr.message };
  if (!ver) return { ok: false, error: 'version not found' };

  const { data: block, error: blockErr } = await supabase
    .from('prompt_blocks')
    .select('id, block_key, tenant_id')
    .eq('id', ver.prompt_block_id)
    .maybeSingle();
  if (blockErr || !block) return { ok: false, error: blockErr?.message ?? 'block not found' };

  // Generar nueva versión con el contenido viejo
  const { data: lastVer } = await supabase
    .from('prompt_block_versions')
    .select('version_number')
    .eq('prompt_block_id', block.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const newVersionNumber = (lastVer?.version_number ?? 0) + 1;

  const { error: insVerErr } = await supabase.from('prompt_block_versions').insert({
    prompt_block_id: block.id,
    version_number: newVersionNumber,
    content: ver.content,
    changed_by: auth.userId,
    change_summary: `Restored from v${ver.version_number}`,
    was_applied: true,
  });
  if (insVerErr) return { ok: false, error: insVerErr.message };

  const { error: updErr } = await supabase
    .from('prompt_blocks')
    .update({ content: ver.content, updated_at: new Date().toISOString(), created_by: auth.userId })
    .eq('id', block.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Reescribir .md fuente
  let mdSyncWarning: string | undefined;
  if (block.block_key !== 'trainer_prefs_v1') {
    const tenantSlug =
      block.tenant_id != null
        ? (await resolveTenantSlug(supabase, block.tenant_id)) ?? undefined
        : undefined;
    const writeResult = await writeBlockToSource({
      blockKey: block.block_key,
      content: ver.content,
      tenantId: block.tenant_id,
      tenantSlug,
    });
    if (!writeResult.ok) mdSyncWarning = writeResult.error;
  }

  revalidatePath('/admin/cerebro');
  revalidatePath(`/admin/cerebro/${block.block_key}`);
  if (block.tenant_id != null) revalidatePath(`/admin/tenants/${block.tenant_id}`);

  return { ok: true, blockId: block.id, newVersionNumber, mdSyncWarning };
}

// ============================================================================
// listGlobalBlocks — para la página /admin/cerebro
// ============================================================================

export interface CerebroListItem {
  id: number;
  blockKey: string;
  sortOrder: number;
  contentChars: number;
  updatedAt: string;
  lastVersionNumber: number;
}

export async function listGlobalBlocks(): Promise<
  { ok: true; blocks: CerebroListItem[] } | { ok: false; error: string }
> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('prompt_blocks')
    .select('id, block_key, sort_order, content, updated_at')
    .is('tenant_id', null)
    .eq('is_active', true)
    .eq('version', 1)
    .order('sort_order');

  if (error) return { ok: false, error: error.message };

  const blocks: CerebroListItem[] = [];
  const rows = data ?? [];
  for (const r of rows) {
    const { data: lastVer } = await supabase
      .from('prompt_block_versions')
      .select('version_number')
      .eq('prompt_block_id', r.id as number)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    blocks.push({
      id: r.id as number,
      blockKey: r.block_key as string,
      sortOrder: r.sort_order as number,
      contentChars: (r.content as string).length,
      updatedAt: r.updated_at as string,
      lastVersionNumber: (lastVer?.version_number as number | undefined) ?? 0,
    });
  }

  return { ok: true, blocks };
}

// ============================================================================
// Trainer preferences (no requiere agency admin — el trainer del tenant también)
// ============================================================================

export async function loadTrainerPreferences(args: {
  tenantId: number;
}): Promise<{ ok: true; preferences: TrainerPreferences } | { ok: false; error: string }> {
  // Auth: usar getEffectiveTenant — el trainer accede a SU tenant; agency admin a cualquiera.
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!eff.isAgencyAdmin && eff.tenantId !== args.tenantId) {
    return { ok: false, error: 'forbidden' };
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', args.tenantId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return { ok: true, preferences: parseTrainerPreferences(data?.preferences ?? null) };
}

export async function saveTrainerPreferences(args: {
  tenantId: number;
  preferences: TrainerPreferences;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!eff.isAgencyAdmin && eff.tenantId !== args.tenantId) {
    return { ok: false, error: 'forbidden' };
  }

  const safePrefs = parseTrainerPreferences(args.preferences as unknown);
  const supabase = getServiceRoleClient();

  // 1. UPSERT trainer_preferences
  const { error: upsertErr } = await supabase
    .from('trainer_preferences')
    .upsert(
      {
        tenant_id: args.tenantId,
        preferences: safePrefs as unknown as Database['public']['Tables']['trainer_preferences']['Row']['preferences'],
        updated_by: eff.userId,
      },
      { onConflict: 'tenant_id' },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  // 2. Regenera trainer_prefs_v1 markdown — incluye prefs + custom instructions activas
  const regenResult = await regenerateTrainerPrefsBlock(args.tenantId, eff.userId);
  if (!regenResult.ok) return regenResult;

  revalidatePath('/settings/preferences');
  if (eff.isAgencyAdmin) {
    revalidatePath(`/admin/tenants/${args.tenantId}`);
  }
  return { ok: true };
}

/**
 * Regenera el bloque prompt_blocks(block_key='trainer_prefs_v1', tenant_id=X)
 * leyendo trainer_preferences + trainer_custom_instructions activas y
 * serializándolos a markdown.
 *
 * Llamada por:
 *   - saveTrainerPreferences cuando el trainer cambia toggles/datos contacto.
 *   - createCustomInstruction / updateCustomInstruction / deleteCustomInstruction
 *     cuando el trainer modifica su lista de instrucciones libres.
 *
 * NO chequea auth — el caller debe haber validado tenant access antes.
 */
export async function regenerateTrainerPrefsBlock(
  tenantId: number,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getServiceRoleClient();

  // Carga prefs estructuradas
  const { data: prefsRow } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const prefs = parseTrainerPreferences(prefsRow?.preferences ?? null);

  // Carga custom instructions activas, ordenadas
  const { data: instructionsRows } = await supabase
    .from('trainer_custom_instructions')
    .select('content')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  const customInstructions = (instructionsRows ?? []).map((r) => r.content as string);

  // Serializa
  const markdown = serializeTrainerPreferences(prefs, customInstructions);

  // UPSERT prompt_blocks
  const { data: existing } = await supabase
    .from('prompt_blocks')
    .select('id')
    .eq('block_key', 'trainer_prefs_v1')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) {
    const { error: updErr } = await supabase
      .from('prompt_blocks')
      .update({
        content: markdown,
        updated_at: new Date().toISOString(),
        created_by: userId,
      })
      .eq('id', existing.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await supabase.from('prompt_blocks').insert({
      block_key: 'trainer_prefs_v1',
      tenant_id: tenantId,
      content: markdown,
      sort_order: 110,
      version: 1,
      is_active: true,
      created_by: userId,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

// ============================================================================
// Sprint Beta — actions para el detalle de tenant
// ============================================================================

export interface TenantBlockSummary {
  /** id de la fila prompt_blocks; null si no existe aún. */
  blockId: number | null;
  blockKey: string;
  /** chars del active actual; 0 si no existe. */
  contentChars: number;
  /** version_number max actual; 0 si no existe ni baseline. */
  activeVersionNumber: number;
  /** ISO timestamp de la última edición; null si no existe. */
  updatedAt: string | null;
  /** true si el bloque NO existe aún (caso típico admin_overrides_v1 sin crear). */
  isMissing: boolean;
}

export interface TenantPromptOverview {
  ok: true;
  tenant: { id: number; slug: string; name: string; isActive: boolean };
  coach: TenantBlockSummary;
  adminOverrides: TenantBlockSummary;
  trainerPrefs: TenantBlockSummary;
}

/**
 * Devuelve el resumen de los 3 bloques scoped a un tenant (coach, admin_overrides,
 * trainer_prefs) + datos del tenant. Usado por la página /admin/tenants/[id]
 * para renderizar tabs sin múltiples roundtrips.
 */
export async function loadTenantBlocks(args: {
  tenantId: number;
}): Promise<TenantPromptOverview | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;
  if (!Number.isFinite(args.tenantId) || args.tenantId <= 0) {
    return { ok: false, error: 'invalid tenantId' };
  }

  const supabase = getServiceRoleClient();

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug, name, is_active')
    .eq('id', args.tenantId)
    .maybeSingle();
  if (tenantErr) return { ok: false, error: tenantErr.message };
  if (!tenant) return { ok: false, error: 'tenant not found' };

  const blockKeys = ['coach_v3', 'admin_overrides_v1', 'trainer_prefs_v1'] as const;

  const summaries = await Promise.all(
    blockKeys.map(async (key) => {
      const { data: block } = await supabase
        .from('prompt_blocks')
        .select('id, content, updated_at')
        .eq('block_key', key)
        .eq('tenant_id', args.tenantId)
        .eq('is_active', true)
        .eq('version', 1)
        .maybeSingle();

      if (!block) {
        return {
          blockId: null,
          blockKey: key,
          contentChars: 0,
          activeVersionNumber: 0,
          updatedAt: null,
          isMissing: true,
        } satisfies TenantBlockSummary;
      }

      const { data: lastVer } = await supabase
        .from('prompt_block_versions')
        .select('version_number')
        .eq('prompt_block_id', block.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        blockId: block.id as number,
        blockKey: key,
        contentChars: (block.content as string).length,
        activeVersionNumber: (lastVer?.version_number as number | undefined) ?? 0,
        updatedAt: block.updated_at as string,
        isMissing: false,
      } satisfies TenantBlockSummary;
    }),
  );

  return {
    ok: true,
    tenant: {
      id: tenant.id as number,
      slug: tenant.slug as string,
      name: tenant.name as string,
      isActive: (tenant.is_active as boolean | null) ?? true,
    },
    coach: summaries[0]!,
    adminOverrides: summaries[1]!,
    trainerPrefs: summaries[2]!,
  };
}

/**
 * Crea un bloque admin_overrides_v1 vacío para un tenant. Se llama desde el
 * tab "Admin Overrides" cuando el bloque aún no existe.
 *
 * Plantilla mínima: comentario explicativo + 1 sección placeholder. Versión 1
 * inicial se inserta en prompt_block_versions automáticamente.
 */
export async function createAdminOverridesBlock(args: {
  tenantId: number;
}): Promise<{ ok: true; blockId: number } | { ok: false; error: string }> {
  const auth = await requireAgencyAdmin();
  if (!auth.ok) return auth;

  const supabase = getServiceRoleClient();

  // Verifica que no exista ya
  const { data: existing } = await supabase
    .from('prompt_blocks')
    .select('id')
    .eq('block_key', 'admin_overrides_v1')
    .eq('tenant_id', args.tenantId)
    .maybeSingle();
  if (existing) return { ok: false, error: 'admin_overrides_v1 ya existe para este tenant' };

  // Plantilla
  const tenantSlug = (await resolveTenantSlug(supabase, args.tenantId)) ?? `tenant_${args.tenantId}`;
  const templateContent = `# Overrides admin para ${tenantSlug}

<!--
  Bloque admin_overrides_v1 — instrucciones extra que SOLO la agencia (Iván)
  añade para este tenant. El trainer NO ve este contenido. Se inyecta en el
  prompt entre el Coach y la fase activa (sort=6).

  Ejemplos de uso:
  - Notas operativas: "Este trainer paga 500€/mes y prefiere agenda en cal.com"
  - Restricciones específicas: "Si lead menciona X, deriva inmediatamente"
  - Contexto de la cuenta: "Hablamos de un nicho premium, evitar tono casual"
-->

## Notas para el agente

(Sin contenido todavía. Edita y guarda para activar.)
`;

  const { data: insRow, error: insErr } = await supabase
    .from('prompt_blocks')
    .insert({
      block_key: 'admin_overrides_v1',
      tenant_id: args.tenantId,
      content: templateContent,
      sort_order: 6,
      version: 1,
      is_active: true,
      created_by: auth.userId,
    })
    .select('id')
    .maybeSingle();
  if (insErr || !insRow) return { ok: false, error: insErr?.message ?? 'insert failed' };

  const { error: insVerErr } = await supabase.from('prompt_block_versions').insert({
    prompt_block_id: insRow.id,
    version_number: 1,
    content: templateContent,
    changed_by: auth.userId,
    change_summary: 'Plantilla inicial admin_overrides',
    was_applied: true,
  });
  if (insVerErr) return { ok: false, error: `insert version failed: ${insVerErr.message}` };

  // Reescribir .md fuente best-effort
  await writeBlockToSource({
    blockKey: 'admin_overrides_v1',
    content: templateContent,
    tenantId: args.tenantId,
    tenantSlug,
  });

  revalidatePath(`/admin/tenants/${args.tenantId}`);
  return { ok: true, blockId: insRow.id };
}
