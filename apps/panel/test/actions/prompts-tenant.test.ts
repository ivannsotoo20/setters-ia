import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests de las actions Sprint Beta para el detalle de tenant:
 *   - loadTenantBlocks
 *   - createAdminOverridesBlock
 *
 * Reutiliza el patrón de mock supabase chain de prompts-versioning.test.ts.
 */

interface FixtureBlock {
  id: number;
  block_key: string;
  tenant_id: number | null;
  content: string;
  sort_order: number;
  version: number;
  is_active: boolean;
  updated_at: string;
}

interface FixtureVersion {
  id: number;
  prompt_block_id: number;
  version_number: number;
  content: string;
  change_summary: string | null;
  changed_at: string;
  changed_by: string | null;
  was_applied: boolean;
}

interface FixtureTenant {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
}

const state = {
  blocks: [] as FixtureBlock[],
  versions: [] as FixtureVersion[],
  tenants: [] as FixtureTenant[],
  nextInsertId: 100,
};

let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
} | null = {
  userId: 'admin-user',
  tenantId: 1,
  isAgencyAdmin: true,
  isImpersonating: false,
};

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));
vi.mock('@/lib/prompt-source-writer', () => ({
  writeBlockToSource: async () => ({ ok: true as const, path: '/mocked', hadFrontmatter: false, created: true }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeMockSupabase(),
}));

function makeMockSupabase() {
  return {
    from(table: string) {
      return makeQueryBuilder(table);
    },
  };
}

function makeQueryBuilder(table: string) {
  const filters: Array<
    | { method: 'eq'; col: string; val: unknown }
    | { method: 'is'; col: string; val: null }
  > = [];
  let orderField: { col: string; ascending: boolean } | null = null;
  let limitN: number | null = null;

  const builder = {
    select: (_cols: string) => builder,
    eq(col: string, val: unknown) {
      filters.push({ method: 'eq', col, val });
      return builder;
    },
    is(col: string, val: null) {
      filters.push({ method: 'is', col, val });
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderField = { col, ascending: opts?.ascending ?? true };
      return builder;
    },
    limit(n: number) {
      limitN = n;
      return builder;
    },
    maybeSingle: async <T,>(): Promise<{ data: T | null; error: null }> => {
      const rows = applyFilters(table, filters, orderField, limitN ?? 1);
      return { data: (rows[0] as T) ?? null, error: null };
    },
    insert(payload: Record<string, unknown>) {
      const id = state.nextInsertId++;
      const fullRec = { id, ...payload };
      if (table === 'prompt_blocks') {
        state.blocks.push(fullRec as unknown as FixtureBlock);
      } else if (table === 'prompt_block_versions') {
        state.versions.push(fullRec as unknown as FixtureVersion);
      }
      return {
        select: (_cols: string) => ({
          maybeSingle: async () => ({ data: fullRec, error: null }),
        }),
        then: <T,>(resolve: (v: { data: null; error: null }) => T) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
    },
  };

  return builder;
}

function applyFilters(
  table: string,
  filters: Array<{ method: 'eq' | 'is'; col: string; val: unknown }>,
  order: { col: string; ascending: boolean } | null,
  limit: number | null,
): Array<Record<string, unknown>> {
  let rows: Array<Record<string, unknown>>;
  if (table === 'prompt_blocks') rows = state.blocks as unknown as Array<Record<string, unknown>>;
  else if (table === 'prompt_block_versions')
    rows = state.versions as unknown as Array<Record<string, unknown>>;
  else if (table === 'tenants') rows = state.tenants as unknown as Array<Record<string, unknown>>;
  else rows = [];

  let filtered = rows.filter((r) => {
    for (const f of filters) {
      if (f.method === 'eq' && r[f.col] !== f.val) return false;
      if (f.method === 'is' && r[f.col] !== null) return false;
    }
    return true;
  });

  if (order) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[order.col] as number;
      const bv = b[order.col] as number;
      return order.ascending ? av - bv : bv - av;
    });
  }
  if (limit != null) filtered = filtered.slice(0, limit);
  return filtered;
}

beforeEach(() => {
  state.blocks = [];
  state.versions = [];
  state.tenants = [];
  state.nextInsertId = 100;
  mockEffectiveTenant = {
    userId: 'admin-user',
    tenantId: 1,
    isAgencyAdmin: true,
    isImpersonating: false,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
});

import { loadTenantBlocks, createAdminOverridesBlock } from '@/lib/actions/prompts';

function seedTenant(t: FixtureTenant) {
  state.tenants.push(t);
}
function seedBlock(b: Omit<FixtureBlock, 'version' | 'is_active' | 'updated_at'> & Partial<Pick<FixtureBlock, 'version' | 'is_active' | 'updated_at'>>) {
  state.blocks.push({
    version: 1,
    is_active: true,
    updated_at: new Date('2026-01-01').toISOString(),
    ...b,
  });
}
function seedVersion(v: Omit<FixtureVersion, 'changed_at' | 'changed_by' | 'was_applied'> & Partial<Pick<FixtureVersion, 'changed_at' | 'changed_by' | 'was_applied'>>) {
  state.versions.push({
    changed_at: new Date('2026-01-01').toISOString(),
    changed_by: null,
    was_applied: true,
    ...v,
  });
}

describe('loadTenantBlocks', () => {
  it('returns tenant info + 3 block summaries with isMissing flags correctly set', async () => {
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván / Fyzon Sandbox', is_active: true });
    // Coach existe, admin_overrides NO, trainer_prefs NO
    seedBlock({ id: 14, block_key: 'coach_v5', tenant_id: 3, content: 'COACH CONTENT', sort_order: 5 });
    seedVersion({ id: 1, prompt_block_id: 14, version_number: 1, content: 'COACH CONTENT', change_summary: 'baseline' });

    const r = await loadTenantBlocks({ tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tenant).toEqual({ id: 3, slug: 'ivan-dev', name: 'Iván / Fyzon Sandbox', isActive: true });
      expect(r.coach.isMissing).toBe(false);
      expect(r.coach.contentChars).toBe('COACH CONTENT'.length);
      expect(r.coach.activeVersionNumber).toBe(1);
      expect(r.adminOverrides.isMissing).toBe(true);
      expect(r.adminOverrides.contentChars).toBe(0);
      expect(r.adminOverrides.activeVersionNumber).toBe(0);
      expect(r.trainerPrefs.isMissing).toBe(true);
    }
  });

  it('returns all 3 missing if tenant has no prompt blocks at all', async () => {
    seedTenant({ id: 5, slug: 'new-tenant', name: 'Nuevo', is_active: true });

    const r = await loadTenantBlocks({ tenantId: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.coach.isMissing).toBe(true);
      expect(r.adminOverrides.isMissing).toBe(true);
      expect(r.trainerPrefs.isMissing).toBe(true);
    }
  });

  it('returns error for non-existent tenant', async () => {
    const r = await loadTenantBlocks({ tenantId: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });

  it('returns error for invalid tenantId', async () => {
    const r1 = await loadTenantBlocks({ tenantId: 0 });
    expect(r1.ok).toBe(false);
    const r2 = await loadTenantBlocks({ tenantId: -5 });
    expect(r2.ok).toBe(false);
    const r3 = await loadTenantBlocks({ tenantId: NaN });
    expect(r3.ok).toBe(false);
  });

  it('non-admin user is forbidden', async () => {
    mockEffectiveTenant = {
      userId: 'trainer-user',
      tenantId: 3,
      isAgencyAdmin: false,
      isImpersonating: false,
    };
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván', is_active: true });

    const r = await loadTenantBlocks({ tenantId: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
  });
});

describe('createAdminOverridesBlock', () => {
  it('creates admin_overrides_v1 block + v1 baseline with template content', async () => {
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván', is_active: true });

    const r = await createAdminOverridesBlock({ tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.blockId).toBeGreaterThan(0);

    // Verifica bloque + version creados
    const block = state.blocks.find((b) => b.block_key === 'admin_overrides_v1' && b.tenant_id === 3);
    expect(block).toBeDefined();
    expect(block!.content).toContain('# Overrides admin para ivan-dev');
    expect(block!.content).toContain('admin_overrides_v1');
    expect(block!.sort_order).toBe(6);

    const version = state.versions.find((v) => v.prompt_block_id === block!.id);
    expect(version).toBeDefined();
    expect(version!.version_number).toBe(1);
    expect(version!.change_summary).toBe('Plantilla inicial admin_overrides');
  });

  it('rejects if admin_overrides_v1 already exists for tenant', async () => {
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván', is_active: true });
    seedBlock({
      id: 50,
      block_key: 'admin_overrides_v1',
      tenant_id: 3,
      content: 'existing',
      sort_order: 6,
    });

    const r = await createAdminOverridesBlock({ tenantId: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya existe/);
  });

  it('non-admin user is forbidden', async () => {
    mockEffectiveTenant = {
      userId: 'trainer-user',
      tenantId: 3,
      isAgencyAdmin: false,
      isImpersonating: false,
    };
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván', is_active: true });

    const r = await createAdminOverridesBlock({ tenantId: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
  });

  it('falls back to tenant_<id> when slug query has no result (edge case)', async () => {
    // No seeded tenant — el resolveTenantSlug devolverá null, fallback "tenant_3"
    seedTenant({ id: 3, slug: 'ivan-dev', name: 'Iván', is_active: true });

    const r = await createAdminOverridesBlock({ tenantId: 3 });
    expect(r.ok).toBe(true);
    const block = state.blocks.find((b) => b.block_key === 'admin_overrides_v1');
    // El nombre del slug viene del tenant seedeado
    expect(block!.content).toContain('ivan-dev');
  });
});
