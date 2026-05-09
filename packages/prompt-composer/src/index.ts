import type { SupabaseClient } from '@supabase/supabase-js';
import { buildComposedPrompt } from './builder.js';
import type { ComposeOptions, ComposedPrompt, PromptBlockRow, TrainerContext } from './types.js';

export type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
  TrainerContext,
} from './types.js';
export { buildComposedPrompt } from './builder.js';
export { interpolateTrainerPlaceholders } from './interpolate.js';

/**
 * Carga los bloques relevantes desde `prompt_blocks` y compone el system prompt.
 *
 * Query: UN solo SELECT que trae:
 *   - Todos los bloques compartidos (tenant_id IS NULL) activos version=1.
 *   - Todos los bloques del tenant solicitado activos version=1.
 *
 * El `buildComposedPrompt` filtra y ordena los que realmente se incluyen
 * segun `ComposeOptions`.
 */
export async function composePrompt(
  supabase: SupabaseClient,
  options: ComposeOptions,
): Promise<ComposedPrompt> {
  const { data, error } = await supabase
    .from('prompt_blocks')
    .select('block_key, content, sort_order, tenant_id')
    .eq('is_active', true)
    .eq('version', 1)
    .or(`tenant_id.is.null,tenant_id.eq.${options.tenantId}`);

  if (error) {
    throw new Error(`composePrompt: supabase query failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `composePrompt: no prompt_blocks found for tenant=${options.tenantId} (ni compartidos)`,
    );
  }

  const rows: PromptBlockRow[] = data.map((r) => ({
    block_key: String(r.block_key),
    content: String(r.content),
    sort_order: Number(r.sort_order),
    tenant_id: r.tenant_id === null ? null : Number(r.tenant_id),
  }));

  // Sprint Gamma 2.6 — Si el caller no pasó trainerContext explícito, lo cargamos
  // de trainer_preferences para interpolar `{{trainer_phone|fallback}}` en handoff_v4.
  // Best-effort: si la query falla o no hay row, ctx.phone=null y los placeholders
  // caen al fallback.
  let trainerContext = options.trainerContext;
  if (trainerContext === undefined) {
    const { data: prefsRow } = await supabase
      .from('trainer_preferences')
      .select('preferences')
      .eq('tenant_id', options.tenantId)
      .maybeSingle();
    const prefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>;
    const phoneRaw = typeof prefs.trainerPhone === 'string' ? prefs.trainerPhone.trim() : '';
    trainerContext = { phone: phoneRaw === '' ? null : phoneRaw };
  }

  return buildComposedPrompt(rows, { ...options, trainerContext });
}
