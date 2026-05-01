import type { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const supabase = getSupabase();
    let supabaseReachable = false;
    let promptBlocksCount: number | null = null;

    try {
      const { count, error } = await supabase
        .from('prompt_blocks')
        .select('*', { count: 'exact', head: true })
        .is('tenant_id', null);

      if (error) {
        app.log.warn({ err: error }, 'Supabase ping failed');
      } else {
        supabaseReachable = true;
        promptBlocksCount = count ?? 0;
      }
    } catch (err) {
      app.log.warn({ err }, 'Supabase client threw');
    }

    return {
      ok: true,
      service: 'motor-agente',
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      supabase_reachable: supabaseReachable,
      prompt_blocks_count: promptBlocksCount,
    };
  });
}
