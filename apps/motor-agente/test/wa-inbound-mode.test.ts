import { describe, it, expect } from 'vitest';
import {
  hasConversationWithSource,
  loadWaInboundMode,
  type WaInboundMode,
} from '../src/services/lead-ingest.js';

/**
 * Tests de los helpers que sustentan el gate WA inbound en webhook-ycloud.ts
 * (Hito 10 sub-fase 3).
 *
 * 4 tests:
 *   1. loadWaInboundMode default 'all' cuando no hay tenant_configs.
 *   2. loadWaInboundMode lee correctamente cada uno de los 3 valores válidos.
 *   3. hasConversationWithSource → false si el lead no existe (externalId desconocido).
 *   4. hasConversationWithSource → true cuando hay conv con source='bienvenida'
 *      y false cuando hay conv pero con source distinto / NULL.
 */

interface TenantConfigRow {
  tenant_id: number;
  wa_inbound_mode?: WaInboundMode | null;
}
interface LeadRow {
  id: number;
  tenant_id: number;
  external_id: string;
  updated_at?: string;
}
interface ConversationRow {
  id: number;
  tenant_id: number;
  lead_id: number;
  conversation_source: string | null;
  state: string;
}

interface MockState {
  tenantConfigs: TenantConfigRow[];
  leads: LeadRow[];
  conversations: ConversationRow[];
}

function applyFilters(rows: Array<Record<string, unknown>>, filters: Array<[string, unknown, string?]>): Array<Record<string, unknown>> {
  let out = rows;
  for (const [col, val, op] of filters) {
    if (op === 'not_eq') {
      out = out.filter((r) => r[col] !== val);
    } else {
      out = out.filter((r) => r[col] === val);
    }
  }
  return out;
}

function makeSupabaseStub(state: MockState) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown, string?]> = [];
      const builder = {
        select(_cols?: string) {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        not(col: string, _op: string, val: unknown) {
          filters.push([col, val, 'not_eq']);
          return builder;
        },
        order(_col: string, _opts?: { ascending?: boolean }) {
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        async maybeSingle<T>(): Promise<{ data: T | null; error: null }> {
          let rows: Array<Record<string, unknown>>;
          if (table === 'tenant_configs') rows = state.tenantConfigs as unknown as Array<Record<string, unknown>>;
          else if (table === 'leads') rows = state.leads as unknown as Array<Record<string, unknown>>;
          else if (table === 'conversations') rows = state.conversations as unknown as Array<Record<string, unknown>>;
          else rows = [];
          const filtered = applyFilters(rows, filters);
          return { data: (filtered[0] as T) ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

describe('loadWaInboundMode', () => {
  it('returns default "all" when tenant_configs row does not exist', async () => {
    const supabase = makeSupabaseStub({ tenantConfigs: [], leads: [], conversations: [] });
    const mode = await loadWaInboundMode(supabase as unknown as Parameters<typeof loadWaInboundMode>[0], 99);
    expect(mode).toBe('all');
  });

  it('reads each of the 3 valid values correctly', async () => {
    for (const value of ['form_only', 'all', 'keyword'] as const) {
      const supabase = makeSupabaseStub({
        tenantConfigs: [{ tenant_id: 3, wa_inbound_mode: value }],
        leads: [],
        conversations: [],
      });
      const mode = await loadWaInboundMode(supabase as unknown as Parameters<typeof loadWaInboundMode>[0], 3);
      expect(mode).toBe(value);
    }
  });
});

describe('hasConversationWithSource', () => {
  it('returns false when the lead does not exist for the given externalId', async () => {
    const supabase = makeSupabaseStub({ tenantConfigs: [], leads: [], conversations: [] });
    const result = await hasConversationWithSource(
      supabase as unknown as Parameters<typeof hasConversationWithSource>[0],
      3,
      '+34600999888',
      'bienvenida',
    );
    expect(result).toBe(false);
  });

  it('returns true with matching source, false with different source or NULL', async () => {
    const baseLead: LeadRow = { id: 10, tenant_id: 3, external_id: '+34600111222' };

    // (a) lead con conv source='bienvenida' active
    const supA = makeSupabaseStub({
      tenantConfigs: [],
      leads: [baseLead],
      conversations: [
        { id: 100, tenant_id: 3, lead_id: 10, conversation_source: 'bienvenida', state: 'active' },
      ],
    });
    expect(
      await hasConversationWithSource(
        supA as unknown as Parameters<typeof hasConversationWithSource>[0],
        3,
        '+34600111222',
        'bienvenida',
      ),
    ).toBe(true);

    // (b) lead con conv source NULL → no matchea 'bienvenida'
    const supB = makeSupabaseStub({
      tenantConfigs: [],
      leads: [baseLead],
      conversations: [{ id: 101, tenant_id: 3, lead_id: 10, conversation_source: null, state: 'active' }],
    });
    expect(
      await hasConversationWithSource(
        supB as unknown as Parameters<typeof hasConversationWithSource>[0],
        3,
        '+34600111222',
        'bienvenida',
      ),
    ).toBe(false);

    // (c) lead con conv source='lm' → no matchea 'bienvenida'
    const supC = makeSupabaseStub({
      tenantConfigs: [],
      leads: [baseLead],
      conversations: [{ id: 102, tenant_id: 3, lead_id: 10, conversation_source: 'lm', state: 'active' }],
    });
    expect(
      await hasConversationWithSource(
        supC as unknown as Parameters<typeof hasConversationWithSource>[0],
        3,
        '+34600111222',
        'bienvenida',
      ),
    ).toBe(false);
  });
});
