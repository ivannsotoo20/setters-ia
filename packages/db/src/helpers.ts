import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.generated.js';

export type PromptBlockRow = Database['public']['Tables']['prompt_blocks']['Row'];

export async function getActivePromptBlocks(
  supabase: SupabaseClient,
  tenantId: number | null,
): Promise<PromptBlockRow[]> {
  const query = supabase
    .from('prompt_blocks')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const { data, error } =
    tenantId === null ? await query.is('tenant_id', null) : await query.eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`getActivePromptBlocks failed: ${error.message}`);
  }
  return (data ?? []) as PromptBlockRow[];
}
