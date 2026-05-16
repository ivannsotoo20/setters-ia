import { describe, it, expect } from 'vitest';
import { _internal } from '../src/services/outbound-sender.js';

/**
 * Regresión Hito 9 (2026-05-16) — Bug gemelo apiKey/api_key en loadSendContext.
 *
 * El panel persiste `apiKey` (camelCase) vía wizard onboarding (apps/panel/lib/actions/integrations.ts)
 * mientras el motor históricamente leía solo `api_key` (snake_case). Mismo bug que el Parche 2.5 de
 * send-welcome-template.ts corrigió. Aquí cubrimos el path normal de outbound-sender (template + texto).
 */

interface IntegrationAccountRow {
  id: number;
  provider: string;
  credentials: Record<string, unknown> | null;
  credentials_encrypted: unknown;
  connection_config: Record<string, unknown>;
  channels: Array<{ channel_type: string }>;
}

interface ConvRow {
  id: number;
  lead_id: number;
}

interface LeadRow {
  id: number;
  external_id: string;
}

function makeSupabaseStub(opts: {
  ia: IntegrationAccountRow;
  conv: ConvRow;
  lead: LeadRow;
}) {
  return {
    from(table: string) {
      const builder = {
        select(_cols?: string) {
          return builder;
        },
        eq(_col: string, _val: unknown) {
          return builder;
        },
        async maybeSingle() {
          if (table === 'integration_accounts') {
            return { data: opts.ia, error: null };
          }
          if (table === 'conversations') {
            return { data: opts.conv, error: null };
          }
          if (table === 'leads') {
            return { data: opts.lead, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('outbound-sender.loadSendContext — apiKey/api_key fallback (Hito 9)', () => {
  it('YCloud · credentials.apiKey (camelCase, panel wizard) → loadSendContext devuelve apiKey', async () => {
    const supabase = makeSupabaseStub({
      ia: {
        id: 100,
        provider: 'ycloud',
        credentials: { apiKey: 'sk-ycloud-camelcase-test-001' },
        credentials_encrypted: null,
        connection_config: { business_phone: '34600000000' },
        channels: [{ channel_type: 'whatsapp' }],
      },
      conv: { id: 200, lead_id: 300 },
      lead: { id: 300, external_id: '34600000001' },
    });

    const ctx = await _internal.loadSendContext(supabase, {
      integrationAccountId: 100,
      conversationId: 200,
    });

    expect(ctx.apiKey).toBe('sk-ycloud-camelcase-test-001');
    expect(ctx.provider).toBe('ycloud');
    expect(ctx.channelType).toBe('whatsapp');
    expect(ctx.businessPhone).toBe('34600000000');
    expect(ctx.externalUserId).toBe('34600000001');
  });

  it('YCloud · credentials.api_key (snake_case, legacy / seed manual) → loadSendContext devuelve apiKey', async () => {
    const supabase = makeSupabaseStub({
      ia: {
        id: 101,
        provider: 'ycloud',
        credentials: { api_key: 'sk-ycloud-snakecase-test-002' },
        credentials_encrypted: null,
        connection_config: { business_phone: '34611111111' },
        channels: [{ channel_type: 'whatsapp' }],
      },
      conv: { id: 201, lead_id: 301 },
      lead: { id: 301, external_id: '34611111112' },
    });

    const ctx = await _internal.loadSendContext(supabase, {
      integrationAccountId: 101,
      conversationId: 201,
    });

    expect(ctx.apiKey).toBe('sk-ycloud-snakecase-test-002');
  });

  it('YCloud · credentials.apiKey vacío + credentials.api_key con valor → cae al snake_case', async () => {
    const supabase = makeSupabaseStub({
      ia: {
        id: 102,
        provider: 'ycloud',
        credentials: { apiKey: '', api_key: 'sk-ycloud-fallback-test-003' },
        credentials_encrypted: null,
        connection_config: { business_phone: '34622222222' },
        channels: [{ channel_type: 'whatsapp' }],
      },
      conv: { id: 202, lead_id: 302 },
      lead: { id: 302, external_id: '34622222223' },
    });

    const ctx = await _internal.loadSendContext(supabase, {
      integrationAccountId: 102,
      conversationId: 202,
    });

    expect(ctx.apiKey).toBe('sk-ycloud-fallback-test-003');
  });

  it('YCloud · credentials sin apiKey ni api_key → throws con mensaje claro', async () => {
    const supabase = makeSupabaseStub({
      ia: {
        id: 103,
        provider: 'ycloud',
        credentials: {},
        credentials_encrypted: null,
        connection_config: { business_phone: '34633333333' },
        channels: [{ channel_type: 'whatsapp' }],
      },
      conv: { id: 203, lead_id: 303 },
      lead: { id: 303, external_id: '34633333334' },
    });

    await expect(
      _internal.loadSendContext(supabase, {
        integrationAccountId: 103,
        conversationId: 203,
      }),
    ).rejects.toThrow(/sin token \(api_key\/apiKey\/apiToken\)/);
  });

  it('GHL · credentials.apiToken (PIT) sigue funcionando (no regresión)', async () => {
    const supabase = makeSupabaseStub({
      ia: {
        id: 104,
        provider: 'ghl',
        credentials: { apiToken: 'pit-ghl-test-004' },
        credentials_encrypted: null,
        connection_config: {},
        channels: [{ channel_type: 'whatsapp' }],
      },
      conv: { id: 204, lead_id: 304 },
      lead: { id: 304, external_id: 'ghl-contact-id-xyz' },
    });

    const ctx = await _internal.loadSendContext(supabase, {
      integrationAccountId: 104,
      conversationId: 204,
    });

    expect(ctx.apiKey).toBe('pit-ghl-test-004');
    expect(ctx.provider).toBe('ghl');
  });
});
