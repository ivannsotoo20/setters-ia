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
  HandoffContext,
} from './types.js';
export { buildComposedPrompt } from './builder.js';
export { interpolateTrainerPlaceholders, renderHandoffDirective } from './interpolate.js';

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

  // Sprint Gamma 2.6 + 2.6b — Si el caller no pasó trainerContext explícito, lo cargamos
  // de trainer_preferences para interpolar `{{trainer_phone|fallback}}` y
  // `{{handoff_directive}}` en handoff_v4. Best-effort: si la query falla o no hay
  // row, ctx queda vacío y los placeholders caen al fallback legacy.
  let trainerContext = options.trainerContext;
  if (trainerContext === undefined) {
    const { data: prefsRow } = await supabase
      .from('trainer_preferences')
      .select('preferences')
      .eq('tenant_id', options.tenantId)
      .maybeSingle();
    const prefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>;
    const phoneRaw = typeof prefs.trainerPhone === 'string' ? prefs.trainerPhone.trim() : '';
    const phone = phoneRaw === '' ? null : phoneRaw;

    // Sprint 2.6b — extraer config handoff (4 fields)
    const handoffEnabled = prefs.handoffPersonalizationEnabled === true;
    const handoffMode = (typeof prefs.handoffMode === 'string' &&
      ['share_phone', 'silent', 'custom_message'].includes(prefs.handoffMode))
      ? (prefs.handoffMode as 'share_phone' | 'silent' | 'custom_message')
      : 'share_phone';
    const handoffTemplate = (typeof prefs.handoffCustomTemplate === 'string' &&
      ['warm', 'professional', 'free'].includes(prefs.handoffCustomTemplate))
      ? (prefs.handoffCustomTemplate as 'warm' | 'professional' | 'free')
      : 'warm';
    const handoffCustomMessage = typeof prefs.handoffCustomMessage === 'string'
      ? prefs.handoffCustomMessage
      : null;

    trainerContext = {
      phone,
      handoff: {
        enabled: handoffEnabled,
        mode: handoffMode,
        template: handoffTemplate,
        customMessage: handoffCustomMessage,
      },
    };
  }

  return buildComposedPrompt(rows, { ...options, trainerContext });
}
