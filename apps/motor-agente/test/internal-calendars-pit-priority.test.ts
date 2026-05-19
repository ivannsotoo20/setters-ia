import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Tests para resolveGhlCredentials (Sprint Iota.5 PR-A).
//
// Verifica que la prioridad es PIT → OAuth → legacy:
//   1. Si hay row con auth_type='pit', se usa esa (no se intenta OAuth ni se
//      llama a getValidAccessToken).
//   2. Si no hay PIT pero OAuth funciona, devuelve oauth.
//   3. Si no hay PIT y OAuth falla, fallback legacy: cualquier row con apiToken
//      decodificable.
//   4. Si nada funciona, devuelve {ok: false, error: 'ghl_unavailable'}.
// =============================================================================

// Mock de getValidAccessToken — se cambia el comportamiento por test.
const getValidAccessTokenMock = vi.fn();
vi.mock('../src/lib/ghl-oauth.js', () => ({
  getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
}));

// Mock de getSupabase — no se usa porque pasamos el cliente directo, pero el
// import lo requiere.
vi.mock('../src/lib/supabase.js', () => ({
  getSupabase: () => ({}) as SupabaseClient,
}));

import { resolveGhlCredentials } from '../src/routes/internal-calendars.js';

interface Row {
  id: number;
  credentials?: Record<string, unknown> | null;
  credentials_encrypted?: { blob: string } | null;
  connection_config?: Record<string, unknown> | null;
}

function buildSupabaseMock(rows: Row[]): SupabaseClient {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_c1: string, _v1: unknown) => ({
          eq: (_c2: string, _v2: unknown) => ({
            eq: (_c3: string, _v3: unknown) => ({
              order: (_col: string, _opts: object) => {
                // Devuelve directamente para el path PIT (sin .limit().maybeSingle())
                const thenable = Promise.resolve({ data: rows, error: null });
                // También expone .limit().maybeSingle() para path legacy.
                return Object.assign(thenable, {
                  limit: (_n: number) => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: rows[0] ?? null, error: null }),
                  }),
                });
              },
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const log = {
  warn: vi.fn(),
  info: vi.fn(),
};

beforeEach(() => {
  getValidAccessTokenMock.mockReset();
  log.warn.mockReset();
  log.info.mockReset();
});

describe('resolveGhlCredentials — prioridad PIT → OAuth → legacy', () => {
  it('1. Prefiere PIT cuando existe (no llama a OAuth)', async () => {
    const supabase = buildSupabaseMock([
      {
        id: 10,
        credentials: { apiToken: 'pit-AAA111', locationId: 'loc_PIT' },
        connection_config: { auth_type: 'pit', locationId: 'loc_PIT' },
      },
      {
        id: 9,
        credentials: { apiToken: 'oauth_token' },
        connection_config: { auth_type: 'oauth', locationId: 'loc_OAUTH' },
      },
    ]);

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credSource).toBe('pit');
      expect(result.accessToken).toBe('pit-AAA111');
      expect(result.locationId).toBe('loc_PIT');
    }
    // OAuth NO debe haberse llamado cuando hay PIT
    expect(getValidAccessTokenMock).not.toHaveBeenCalled();
  });

  it('2. Cae a OAuth si no hay PIT', async () => {
    const supabase = buildSupabaseMock([
      {
        id: 9,
        credentials: { apiToken: 'oauth_token' },
        connection_config: { auth_type: 'oauth', locationId: 'loc_OAUTH' },
      },
    ]);
    getValidAccessTokenMock.mockResolvedValueOnce({
      accessToken: 'OAUTH_ACCESS_REFRESHED',
      locationId: 'loc_OAUTH',
    });

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credSource).toBe('oauth');
      expect(result.accessToken).toBe('OAUTH_ACCESS_REFRESHED');
      expect(result.locationId).toBe('loc_OAUTH');
    }
    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it('3. Cae a legacy si no hay PIT y OAuth lanza (row sin auth_type pero con apiToken)', async () => {
    // Row legacy: no tiene auth_type='pit' ni 'oauth' explícito → se usa solo como legacy fallback.
    const supabase = buildSupabaseMock([
      {
        id: 7,
        credentials: { apiToken: 'legacy-token-AAA' },
        connection_config: { locationId: 'loc_LEGACY' },
      },
    ]);
    getValidAccessTokenMock.mockRejectedValueOnce(new Error('no OAuth row for tenant'));

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credSource).toBe('legacy');
      expect(result.accessToken).toBe('legacy-token-AAA');
      expect(result.locationId).toBe('loc_LEGACY');
    }
  });

  it('4. Falla limpio si no hay PIT, OAuth lanza y no hay legacy row', async () => {
    const supabase = buildSupabaseMock([]);
    getValidAccessTokenMock.mockRejectedValueOnce(new Error('no OAuth row'));

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('ghl_unavailable');
      expect(result.status).toBe(409);
    }
  });

  it('5. PIT sin locationId + sin OAuth → reporta ghl_credentials_incomplete (legacy fallback)', async () => {
    // Row PIT incompleta (sin locationId en credentials ni en connection_config).
    // El flujo cae a OAuth (lanza), luego a legacy fallback que carga la misma
    // row y detecta que falta locationId.
    const supabase = buildSupabaseMock([
      {
        id: 10,
        credentials: { apiToken: 'pit-BBB222' },
        connection_config: { auth_type: 'pit' }, // sin locationId
      },
    ]);
    getValidAccessTokenMock.mockRejectedValueOnce(new Error('no OAuth row'));

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // El mensaje viene del fallback legacy con el row PIT incompleto;
      // el trainer debe reconfigurar la integración.
      expect(result.error).toBe('ghl_credentials_incomplete');
      expect(result.status).toBe(409);
    }
  });

  it('6. locationId puede venir de credentials o connection_config (PIT)', async () => {
    // PIT con locationId solo en credentials (no en connection_config)
    const supabase = buildSupabaseMock([
      {
        id: 10,
        credentials: { apiToken: 'pit-CCC333', locationId: 'loc_FROM_CREDS' },
        connection_config: { auth_type: 'pit' },
      },
    ]);

    const result = await resolveGhlCredentials(supabase, 2, log);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credSource).toBe('pit');
      expect(result.locationId).toBe('loc_FROM_CREDS');
    }
  });
});
