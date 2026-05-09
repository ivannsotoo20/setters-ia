import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests del versionado de prompt blocks (Sprint Alpha).
 *
 * Cubrimos:
 * 1. Apply normal: currentVer=1 → v2 creada con contenido nuevo, prompt_blocks
 *    actualizado, draft borrado.
 * 2. Auto-baseline: bloque sin versions (currentVer=0) + draft.base_version=0
 *    → applyDraft inserta v1 con contenido VIEJO + v2 con contenido nuevo.
 * 3. Conflict detection: draft.base_version=1 pero currentVer=2 → 409.
 * 4. Restore: crea version nueva con contenido viejo, increments max_v.
 * 5. Bloque nuevo (no active row): INSERT prompt_blocks + v1 con contenido nuevo.
 *
 * Mock pattern: chain mock supabase client para emular .from().select().eq()...
 */

// ----------------------------------------------------------------------------
// Mock infra
// ----------------------------------------------------------------------------

interface InsertCall {
  table: string;
  payload: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

interface DeleteCall {
  table: string;
  filters: Array<{ col: string; val: unknown; method: 'eq' | 'is' }>;
}

const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

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

interface FixtureDraft {
  id: number;
  block_key: string;
  tenant_id: number | null;
  content: string;
  base_version: number;
  owner_user_id: string;
  updated_at: string;
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
  drafts: [] as FixtureDraft[],
  tenants: [] as FixtureTenant[],
  nextInsertId: 1,
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

// Source writer mock: pretendemos que la escritura .md siempre falla benignamente
// (no afecta a la lógica de BD que estamos testeando).
vi.mock('@/lib/prompt-source-writer', () => ({
  writeBlockToSource: async () => ({
    ok: false as const,
    error: 'mocked: source writer disabled in tests',
  }),
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

interface MaybeSingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface MultiResult<T> {
  data: T[] | null;
  error: { message: string } | null;
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
    maybeSingle: async <T>(): Promise<MaybeSingleResult<T>> => {
      const rows = applyFilters(table, filters, orderField, limitN ?? 1);
      return { data: (rows[0] as T) ?? null, error: null };
    },
    then<T>(resolve: (v: MultiResult<T>) => unknown) {
      const rows = applyFilters(table, filters, orderField, limitN);
      return Promise.resolve({ data: rows as T[], error: null }).then(resolve);
    },
    insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
      insertCalls.push({ table, payload });
      const records = Array.isArray(payload) ? payload : [payload];
      const inserted: Record<string, unknown>[] = [];
      for (const rec of records) {
        const id = state.nextInsertId++;
        const fullRec = { id, ...rec };
        if (table === 'prompt_block_versions') {
          state.versions.push(fullRec as unknown as FixtureVersion);
        } else if (table === 'prompt_blocks') {
          state.blocks.push(fullRec as unknown as FixtureBlock);
        } else if (table === 'prompt_block_drafts') {
          state.drafts.push(fullRec as unknown as FixtureDraft);
        }
        inserted.push(fullRec);
      }
      const insertChain = {
        select: (_cols: string) => ({
          maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }),
        }),
        then: <T>(resolve: (v: { data: null; error: null }) => T) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return insertChain;
    },
    update(payload: Record<string, unknown>) {
      const call: UpdateCall = { table, payload, filters: [] };
      updateCalls.push(call);
      const chain = {
        eq(col: string, val: unknown) {
          call.filters.push({ col, val });
          if (table === 'prompt_blocks') {
            for (const b of state.blocks) {
              if (call.filters.every((f) => (b as unknown as Record<string, unknown>)[f.col] === f.val)) {
                Object.assign(b, payload);
              }
            }
          }
          return chain;
        },
        then<T>(resolve: (v: { error: null }) => T) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
    delete() {
      const call: DeleteCall = { table, filters: [] };
      deleteCalls.push(call);
      const chain = {
        eq(col: string, val: unknown) {
          call.filters.push({ col, val, method: 'eq' });
          if (table === 'prompt_block_drafts') {
            state.drafts = state.drafts.filter(
              (d) => !call.filters.every((f) => (d as unknown as Record<string, unknown>)[f.col] === f.val),
            );
          }
          return chain;
        },
        is(col: string, val: null) {
          call.filters.push({ col, val, method: 'is' });
          return chain;
        },
        then<T>(resolve: (v: { error: null }) => T) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
    upsert: (_payload: unknown, _opts?: unknown) => ({
      select: () => ({
        maybeSingle: async () => ({ data: { id: state.nextInsertId++ }, error: null }),
      }),
    }),
  };

  return builder;
}

function applyFilters(
  table: string,
  filters: Array<
    | { method: 'eq'; col: string; val: unknown }
    | { method: 'is'; col: string; val: null }
  >,
  order: { col: string; ascending: boolean } | null,
  limit: number | null,
): Array<Record<string, unknown>> {
  let rows: Array<Record<string, unknown>>;
  if (table === 'prompt_blocks') rows = state.blocks as unknown as Array<Record<string, unknown>>;
  else if (table === 'prompt_block_versions')
    rows = state.versions as unknown as Array<Record<string, unknown>>;
  else if (table === 'prompt_block_drafts')
    rows = state.drafts as unknown as Array<Record<string, unknown>>;
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
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  state.blocks = [];
  state.versions = [];
  state.drafts = [];
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

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

import { applyDraft, restoreVersion, listVersions } from '@/lib/actions/prompts';

function seedBlock(opts: {
  id: number;
  blockKey: string;
  tenantId: number | null;
  content: string;
  sortOrder?: number;
}) {
  state.blocks.push({
    id: opts.id,
    block_key: opts.blockKey,
    tenant_id: opts.tenantId,
    content: opts.content,
    sort_order: opts.sortOrder ?? 0,
    version: 1,
    is_active: true,
    updated_at: new Date('2026-01-01').toISOString(),
  });
}

function seedVersion(opts: {
  id: number;
  promptBlockId: number;
  versionNumber: number;
  content: string;
  changeSummary?: string;
}) {
  state.versions.push({
    id: opts.id,
    prompt_block_id: opts.promptBlockId,
    version_number: opts.versionNumber,
    content: opts.content,
    change_summary: opts.changeSummary ?? null,
    changed_at: new Date('2026-01-01').toISOString(),
    changed_by: null,
    was_applied: true,
  });
}

function seedDraft(opts: {
  id: number;
  blockKey: string;
  tenantId: number | null;
  content: string;
  baseVersion: number;
  ownerUserId?: string;
}) {
  state.drafts.push({
    id: opts.id,
    block_key: opts.blockKey,
    tenant_id: opts.tenantId,
    content: opts.content,
    base_version: opts.baseVersion,
    owner_user_id: opts.ownerUserId ?? 'admin-user',
    updated_at: new Date('2026-01-01').toISOString(),
  });
}

describe('applyDraft — versioning', () => {
  it('global block with v1 baseline → Apply creates v2 + updates active content', async () => {
    seedBlock({ id: 20, blockKey: 'fase_5_v4', tenantId: null, content: 'OLD content', sortOrder: 50 });
    seedVersion({ id: 1, promptBlockId: 20, versionNumber: 1, content: 'OLD content' });
    seedDraft({ id: 1, blockKey: 'fase_5_v4', tenantId: null, content: 'NEW content', baseVersion: 1 });

    const r = await applyDraft({ blockKey: 'fase_5_v4', tenantId: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.newVersionNumber).toBe(2);
      expect(r.blockId).toBe(20);
    }

    // Versions: ahora hay v1 (baseline) + v2 (nueva)
    expect(state.versions).toHaveLength(2);
    const v2 = state.versions.find((v) => v.version_number === 2)!;
    expect(v2.content).toBe('NEW content');
    expect(v2.was_applied).toBe(true);

    // prompt_blocks.content = NEW
    const block = state.blocks.find((b) => b.id === 20)!;
    expect(block.content).toBe('NEW content');

    // Draft borrado
    expect(state.drafts).toHaveLength(0);
  });

  it('multiple Apply create incremental versions (v1 baseline → v2 → v3)', async () => {
    seedBlock({ id: 30, blockKey: 'fase_3_v4', tenantId: null, content: 'INITIAL', sortOrder: 30 });
    seedVersion({ id: 1, promptBlockId: 30, versionNumber: 1, content: 'INITIAL' });

    seedDraft({ id: 1, blockKey: 'fase_3_v4', tenantId: null, content: 'V2 CONTENT', baseVersion: 1 });
    const r1 = await applyDraft({ blockKey: 'fase_3_v4', tenantId: null, changeSummary: 'first edit' });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.newVersionNumber).toBe(2);

    seedDraft({ id: 2, blockKey: 'fase_3_v4', tenantId: null, content: 'V3 CONTENT', baseVersion: 2 });
    const r2 = await applyDraft({ blockKey: 'fase_3_v4', tenantId: null, changeSummary: 'second edit' });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.newVersionNumber).toBe(3);

    expect(state.versions).toHaveLength(3);
    expect(state.versions.map((v) => v.version_number).sort()).toEqual([1, 2, 3]);
    expect(state.blocks[0]!.content).toBe('V3 CONTENT');
    expect(state.versions.find((v) => v.version_number === 2)!.change_summary).toBe('first edit');
    expect(state.versions.find((v) => v.version_number === 3)!.change_summary).toBe('second edit');
  });

  it('auto-baseline: block with NO versions + draft.base_version=0 → inserts v1 baseline + v2 new', async () => {
    seedBlock({ id: 99, blockKey: 'fase_4_v4', tenantId: null, content: 'BASELINE', sortOrder: 40 });
    // NO versions sembradas
    seedDraft({ id: 1, blockKey: 'fase_4_v4', tenantId: null, content: 'NEW', baseVersion: 0 });

    const r = await applyDraft({ blockKey: 'fase_4_v4', tenantId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.newVersionNumber).toBe(2);

    // Versions: v1 (auto-baseline con BASELINE) + v2 (NEW)
    expect(state.versions).toHaveLength(2);
    const v1 = state.versions.find((v) => v.version_number === 1)!;
    expect(v1.content).toBe('BASELINE');
    expect(v1.change_summary).toBe('Auto-baseline (pre-first-edit snapshot)');

    const v2 = state.versions.find((v) => v.version_number === 2)!;
    expect(v2.content).toBe('NEW');

    expect(state.blocks[0]!.content).toBe('NEW');
  });

  it('conflict: draft.base_version stale vs current → 409', async () => {
    seedBlock({ id: 40, blockKey: 'fase_2_v4', tenantId: null, content: 'V3 active', sortOrder: 20 });
    seedVersion({ id: 1, promptBlockId: 40, versionNumber: 1, content: 'baseline' });
    seedVersion({ id: 2, promptBlockId: 40, versionNumber: 2, content: 'V2' });
    seedVersion({ id: 3, promptBlockId: 40, versionNumber: 3, content: 'V3 active' });

    // Otro admin avanzó a v3, pero el draft de este usuario es contra v1
    seedDraft({ id: 1, blockKey: 'fase_2_v4', tenantId: null, content: 'mi cambio', baseVersion: 1 });

    const r = await applyDraft({ blockKey: 'fase_2_v4', tenantId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/conflict/);
      expect(r.error).toMatch(/base_version=1.*current=3/);
    }

    // No version nueva creada, no UPDATE en prompt_blocks (más allá del seed)
    expect(state.versions).toHaveLength(3);
    expect(state.blocks[0]!.content).toBe('V3 active');
  });

  it('block per tenant (coach_v3) versioning: scoped al tenant correcto', async () => {
    seedBlock({ id: 14, blockKey: 'coach_v3', tenantId: 3, content: 'coach Iván', sortOrder: 5 });
    seedVersion({ id: 1, promptBlockId: 14, versionNumber: 1, content: 'coach Iván' });
    seedDraft({
      id: 1,
      blockKey: 'coach_v3',
      tenantId: 3,
      content: 'coach Iván v2',
      baseVersion: 1,
    });

    const r = await applyDraft({ blockKey: 'coach_v3', tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.newVersionNumber).toBe(2);
      expect(r.blockId).toBe(14);
    }
    expect(state.blocks.find((b) => b.id === 14)!.content).toBe('coach Iván v2');
  });

  it('non-admin user is forbidden from applyDraft', async () => {
    mockEffectiveTenant = {
      userId: 'trainer-user',
      tenantId: 3,
      isAgencyAdmin: false,
      isImpersonating: false,
    };
    seedBlock({ id: 14, blockKey: 'coach_v3', tenantId: 3, content: 'X', sortOrder: 5 });
    seedVersion({ id: 1, promptBlockId: 14, versionNumber: 1, content: 'X' });
    seedDraft({ id: 1, blockKey: 'coach_v3', tenantId: 3, content: 'Y', baseVersion: 1 });

    const r = await applyDraft({ blockKey: 'coach_v3', tenantId: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
  });
});

describe('restoreVersion', () => {
  it('creates a new version (max+1) with the OLD content, updates prompt_blocks', async () => {
    seedBlock({ id: 50, blockKey: 'fase_1_v4', tenantId: null, content: 'V3 current', sortOrder: 10 });
    seedVersion({ id: 1, promptBlockId: 50, versionNumber: 1, content: 'V1 baseline' });
    seedVersion({ id: 2, promptBlockId: 50, versionNumber: 2, content: 'V2 mid' });
    seedVersion({ id: 3, promptBlockId: 50, versionNumber: 3, content: 'V3 current' });

    // Restore v1
    const r = await restoreVersion({ versionId: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.newVersionNumber).toBe(4);

    // Ahora hay 4 versions, la v4 contiene 'V1 baseline'
    expect(state.versions).toHaveLength(4);
    const v4 = state.versions.find((v) => v.version_number === 4)!;
    expect(v4.content).toBe('V1 baseline');
    expect(v4.change_summary).toBe('Restored from v1');

    // active content vuelve a V1 baseline
    expect(state.blocks[0]!.content).toBe('V1 baseline');
  });
});

describe('listVersions', () => {
  it('returns versions ordered by version_number desc, limited', async () => {
    seedBlock({ id: 60, blockKey: 'objeciones_v4', tenantId: null, content: 'X', sortOrder: 70 });
    seedVersion({ id: 1, promptBlockId: 60, versionNumber: 1, content: 'a', changeSummary: 'first' });
    seedVersion({ id: 2, promptBlockId: 60, versionNumber: 2, content: 'b', changeSummary: 'second' });
    seedVersion({ id: 3, promptBlockId: 60, versionNumber: 3, content: 'c', changeSummary: 'third' });

    const r = await listVersions({ blockKey: 'objeciones_v4', tenantId: null, limit: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.versions).toHaveLength(3);
      expect(r.versions[0]!.versionNumber).toBe(3);
      expect(r.versions[2]!.versionNumber).toBe(1);
      expect(r.versions[0]!.changeSummary).toBe('third');
    }
  });

  it('returns empty when block has no versions', async () => {
    seedBlock({ id: 70, blockKey: 'handoff_v4', tenantId: null, content: 'X', sortOrder: 90 });
    const r = await listVersions({ blockKey: 'handoff_v4', tenantId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.versions).toHaveLength(0);
  });
});
