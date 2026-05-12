import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGhlInboundMode } from '../src/services/ghl-message-router.js';

// =============================================================================
// Sprint B (2026-05-12) — Tests para loadGhlInboundMode.
//
// Cubre: lectura de tenant_configs.ghl_inbound_mode con fallback robusto a
// 'classified_only' (doctrina nueva por default).
// =============================================================================

function buildSupabaseMock(scenario: {
  ghlInboundMode?: string | null;
  error?: { message: string } | null;
}): SupabaseClient {
  const data = scenario.ghlInboundMode !== undefined
    ? { ghl_inbound_mode: scenario.ghlInboundMode }
    : null;
  const error = scenario.error ?? null;
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () => ({ data, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('loadGhlInboundMode', () => {
  it('devuelve classified_only cuando tenant_configs tiene ese valor', async () => {
    const supabase = buildSupabaseMock({ ghlInboundMode: 'classified_only' });
    const mode = await loadGhlInboundMode(supabase, 3);
    expect(mode).toBe('classified_only');
  });

  it('devuelve all cuando tenant_configs tiene ese valor (escape hatch)', async () => {
    const supabase = buildSupabaseMock({ ghlInboundMode: 'all' });
    const mode = await loadGhlInboundMode(supabase, 3);
    expect(mode).toBe('all');
  });

  it('fallback classified_only cuando tenant_configs no tiene row', async () => {
    const supabase = buildSupabaseMock({});
    const mode = await loadGhlInboundMode(supabase, 999);
    expect(mode).toBe('classified_only');
  });

  it('fallback classified_only cuando ghl_inbound_mode es null en BD', async () => {
    const supabase = buildSupabaseMock({ ghlInboundMode: null });
    const mode = await loadGhlInboundMode(supabase, 3);
    expect(mode).toBe('classified_only');
  });

  it('fallback classified_only cuando valor no reconocido', async () => {
    const supabase = buildSupabaseMock({ ghlInboundMode: 'foo_invalid' });
    const mode = await loadGhlInboundMode(supabase, 3);
    expect(mode).toBe('classified_only');
  });

  it('fallback classified_only si BD falla con error', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'db down' } });
    const mode = await loadGhlInboundMode(supabase, 3);
    expect(mode).toBe('classified_only');
  });
});
