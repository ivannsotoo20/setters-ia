import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIntegrationsHealth } from '../src/services/integration-health-check.js';

// =============================================================================
// Tests para checkIntegrationsHealth (Sprint Iota.5 PR-D).
// Verifica que el cron solo enqueue eventos para integraciones que cruzan
// el threshold rojo + respeta el dedupe por window_key.
// =============================================================================

interface FakeRow {
  id: number;
  tenant_id: number;
  provider: string;
  is_active: boolean;
  last_webhook_at: string | null;
  created_at: string;
  channel_id: number;
  channels?: { channel_type: string } | null;
}

interface FakeTenantConfig {
  tenant_id: number;
  health_threshold_hours_red: number;
}

interface FakeInsert {
  tenant_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
}

function buildMock(args: {
  configs: FakeTenantConfig[];
  rows: FakeRow[];
  insertConflictKeys?: Set<string>;
}): { supabase: SupabaseClient; inserts: FakeInsert[] } {
  const inserts: FakeInsert[] = [];
  const conflictKeys = args.insertConflictKeys ?? new Set<string>();

  const supabase = {
    from: (table: string) => {
      if (table === 'tenant_configs') {
        return {
          select: (_cols: string) => Promise.resolve({ data: args.configs, error: null }),
        };
      }
      if (table === 'integration_accounts') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) => Promise.resolve({ data: args.rows, error: null }),
          }),
        };
      }
      if (table === 'notification_events') {
        return {
          insert: (payload: FakeInsert) => {
            const key = `${payload.tenant_id}:${(payload.payload.integration_account_id as number)}:${(payload.payload.window_key as string)}`;
            if (conflictKeys.has(key)) {
              return Promise.resolve({ error: { code: '23505', message: 'duplicate' } });
            }
            conflictKeys.add(key);
            inserts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { supabase, inserts };
}

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  log.info.mockReset();
  log.warn.mockReset();
  log.error.mockReset();
});

const FIXED_NOW = new Date('2026-05-19T12:00:00Z');

describe('checkIntegrationsHealth', () => {
  it('no enqueue para integraciones verdes (<threshold)', async () => {
    const tenSecondsAgo = new Date(FIXED_NOW.getTime() - 10 * 1000).toISOString();
    const { supabase, inserts } = buildMock({
      configs: [{ tenant_id: 2, health_threshold_hours_red: 72 }],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ghl',
          is_active: true,
          last_webhook_at: tenSecondsAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 1,
          channels: { channel_type: 'whatsapp' },
        },
      ],
    });
    const result = await checkIntegrationsHealth({ supabase, now: () => FIXED_NOW, log });
    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(result.skipped).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it('enqueue para integraciones rojas (>threshold)', async () => {
    const eightDaysAgo = new Date(FIXED_NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { supabase, inserts } = buildMock({
      configs: [{ tenant_id: 2, health_threshold_hours_red: 72 }],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ycloud',
          is_active: true,
          last_webhook_at: eightDaysAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 1,
          channels: { channel_type: 'whatsapp' },
        },
      ],
    });
    const result = await checkIntegrationsHealth({ supabase, now: () => FIXED_NOW, log });
    expect(result.enqueued).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.event_type).toBe('integration_down');
    expect(inserts[0]?.payload.provider).toBe('ycloud');
    expect(inserts[0]?.payload.integration_account_id).toBe(10);
    expect(inserts[0]?.payload.window_key).toBe('2'); // 8d / 3d ≈ 2.6 → floor=2
  });

  it('respeta el threshold per-tenant (override desde tenant_configs)', async () => {
    // Tenant con threshold MUY alto (no enqueue) y tenant con threshold normal (sí enqueue)
    const fourDaysAgo = new Date(FIXED_NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const { supabase, inserts } = buildMock({
      configs: [
        { tenant_id: 2, health_threshold_hours_red: 72 }, // 4d > 72h = 3d → enqueue
        { tenant_id: 3, health_threshold_hours_red: 720 }, // 4d < 720h = 30d → skip
      ],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ycloud',
          is_active: true,
          last_webhook_at: fourDaysAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 1,
        },
        {
          id: 20,
          tenant_id: 3,
          provider: 'ycloud',
          is_active: true,
          last_webhook_at: fourDaysAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 2,
        },
      ],
    });
    const result = await checkIntegrationsHealth({ supabase, now: () => FIXED_NOW, log });
    expect(result.enqueued).toBe(1);
    expect(result.skipped).toBe(1);
    expect(inserts[0]?.tenant_id).toBe(2);
  });

  it('dedup por window_key — re-tick mismo bloque no enqueue duplicate', async () => {
    const eightDaysAgo = new Date(FIXED_NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const sharedConflicts = new Set<string>();
    const m1 = buildMock({
      configs: [{ tenant_id: 2, health_threshold_hours_red: 72 }],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ghl',
          is_active: true,
          last_webhook_at: eightDaysAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 1,
        },
      ],
      insertConflictKeys: sharedConflicts,
    });
    const r1 = await checkIntegrationsHealth({ supabase: m1.supabase, now: () => FIXED_NOW, log });
    expect(r1.enqueued).toBe(1);

    // Re-tick: el insert anterior dejó la key en sharedConflicts → ahora 23505
    const m2 = buildMock({
      configs: [{ tenant_id: 2, health_threshold_hours_red: 72 }],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ghl',
          is_active: true,
          last_webhook_at: eightDaysAgo,
          created_at: '2026-05-01T00:00:00Z',
          channel_id: 1,
        },
      ],
      insertConflictKeys: sharedConflicts,
    });
    const r2 = await checkIntegrationsHealth({ supabase: m2.supabase, now: () => FIXED_NOW, log });
    expect(r2.enqueued).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  it('usa created_at como referencia si last_webhook_at es NULL', async () => {
    // Integración recién creada (sin webhook todavía) NO debe alertar.
    const oneHourAgo = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000).toISOString();
    const { supabase, inserts } = buildMock({
      configs: [{ tenant_id: 2, health_threshold_hours_red: 72 }],
      rows: [
        {
          id: 10,
          tenant_id: 2,
          provider: 'ghl',
          is_active: true,
          last_webhook_at: null,
          created_at: oneHourAgo, // creada hace 1h
          channel_id: 1,
        },
      ],
    });
    const result = await checkIntegrationsHealth({ supabase, now: () => FIXED_NOW, log });
    expect(result.enqueued).toBe(0); // 1h < 72h
    expect(inserts).toHaveLength(0);
  });
});
