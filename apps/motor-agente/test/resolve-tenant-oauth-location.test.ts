import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTenantByOauthLocation } from '../src/services/lead-ingest.js';

// =============================================================================
// Tests para resolveTenantByOauthLocation — routing multi-tenant del webhook
// POST /integrations/webhook/oauth (App Marketplace GHL).
//
// Cubre: match exacto, no-match por locationId distinto, exclusión de filas
// sin auth_type='oauth' (workflows custom legacy NO matchean), múltiples
// integration_accounts con distintos locationIds, error de BD.
// =============================================================================

function buildSupabaseMock(scenario: {
  rows?: Array<{ tenant_id: number; connection_config: Record<string, unknown> }>;
  error?: { message: string } | null;
}): SupabaseClient {
  const data = scenario.rows ?? [];
  const error = scenario.error ?? null;

  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) =>
            Promise.resolve({ data, error }) as never,
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('resolveTenantByOauthLocation', () => {
  it('devuelve null si locationId está vacío', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const res = await resolveTenantByOauthLocation(supabase, '');
    expect(res).toBeNull();
  });

  it('devuelve null si no hay integration_accounts', async () => {
    const supabase = buildSupabaseMock({ rows: [] });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_AAA');
    expect(res).toBeNull();
  });

  it('matchea integration_account con auth_type=oauth y locationId exacto', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          tenant_id: 2,
          connection_config: { auth_type: 'oauth', locationId: 'loc_pablo' },
        },
        {
          tenant_id: 7,
          connection_config: { auth_type: 'oauth', locationId: 'loc_otro' },
        },
      ],
    });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_pablo');
    expect(res).toBe(2);
  });

  it('NO matchea integration_account sin auth_type=oauth (workflow custom legacy)', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          tenant_id: 3,
          connection_config: { locationId: 'loc_ivan_sandbox' }, // sin auth_type
        },
      ],
    });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_ivan_sandbox');
    expect(res).toBeNull();
  });

  it('NO matchea integration_account con auth_type=manual aunque locationId coincida', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          tenant_id: 5,
          connection_config: { auth_type: 'manual', locationId: 'loc_AAA' },
        },
      ],
    });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_AAA');
    expect(res).toBeNull();
  });

  it('devuelve null si locationId no coincide con ninguno', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        {
          tenant_id: 2,
          connection_config: { auth_type: 'oauth', locationId: 'loc_pablo' },
        },
      ],
    });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_desconocido');
    expect(res).toBeNull();
  });

  it('devuelve null si error en BD', async () => {
    const supabase = buildSupabaseMock({
      rows: [],
      error: { message: 'db down' },
    });
    const res = await resolveTenantByOauthLocation(supabase, 'loc_AAA');
    expect(res).toBeNull();
  });

  it('matchea correctamente cuando hay múltiples sub-cuentas oauth', async () => {
    const supabase = buildSupabaseMock({
      rows: [
        { tenant_id: 1, connection_config: { auth_type: 'oauth', locationId: 'loc_A' } },
        { tenant_id: 2, connection_config: { auth_type: 'oauth', locationId: 'loc_B' } },
        { tenant_id: 3, connection_config: { auth_type: 'oauth', locationId: 'loc_C' } },
        { tenant_id: 4, connection_config: { auth_type: 'oauth', locationId: 'loc_D' } },
      ],
    });
    expect(await resolveTenantByOauthLocation(supabase, 'loc_A')).toBe(1);
    expect(await resolveTenantByOauthLocation(supabase, 'loc_B')).toBe(2);
    expect(await resolveTenantByOauthLocation(supabase, 'loc_C')).toBe(3);
    expect(await resolveTenantByOauthLocation(supabase, 'loc_D')).toBe(4);
  });

  it('coexistencia: legacy workflow custom + oauth marketplace en distintos tenants', async () => {
    // Caso real esperado: tenant 3 está con workflow custom (sin auth_type='oauth'
    // — connection_config sólo tiene locationId), tenant 2 (Pablo) en futuro con
    // app Marketplace OAuth real. La resolución oauth solo matchea tenant 2.
    const supabase = buildSupabaseMock({
      rows: [
        {
          tenant_id: 3,
          connection_config: { locationId: 'FOxJtkxqNKJjGSuYMEk0' }, // legacy
        },
        {
          tenant_id: 2,
          connection_config: { auth_type: 'oauth', locationId: 'loc_pablo_oauth' },
        },
      ],
    });
    expect(
      await resolveTenantByOauthLocation(supabase, 'FOxJtkxqNKJjGSuYMEk0'),
    ).toBeNull();
    expect(
      await resolveTenantByOauthLocation(supabase, 'loc_pablo_oauth'),
    ).toBe(2);
  });
});
