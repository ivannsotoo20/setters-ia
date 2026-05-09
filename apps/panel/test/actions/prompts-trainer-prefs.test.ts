import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests Sprint Gamma — actions de trainer preferences:
 *   - loadTrainerPreferences: defaults si no existe + parse defensivo si JSON corrupto.
 *   - saveTrainerPreferences: UPSERT trainer_preferences + UPSERT prompt_blocks
 *     trainer_prefs_v1 con markdown serializado + auth scoped (trainer del tenant
 *     o agency admin).
 */

interface FixturePrefsRow {
  id: number;
  tenant_id: number;
  preferences: unknown;
  updated_by: string | null;
  updated_at: string;
}

interface FixtureBlockRow {
  id: number;
  block_key: string;
  tenant_id: number | null;
  content: string;
  sort_order: number;
  version: number;
  is_active: boolean;
  updated_at: string;
}

const state = {
  prefs: [] as FixturePrefsRow[],
  blocks: [] as FixtureBlockRow[],
  nextInsertId: 100,
  upsertCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
};

let mockEffectiveTenant: {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  isImpersonating: boolean;
} | null = {
  userId: 'trainer-user',
  tenantId: 3,
  isAgencyAdmin: false,
  isImpersonating: false,
};

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/effective-tenant', () => ({
  getEffectiveTenant: async () => mockEffectiveTenant,
}));
vi.mock('@/lib/prompt-source-writer', () => ({
  writeBlockToSource: async () => ({ ok: false as const, error: 'mocked' }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      return makeQueryBuilder(table);
    },
  }),
}));

function makeQueryBuilder(table: string) {
  const filters: Array<{ method: 'eq'; col: string; val: unknown }> = [];

  const builder = {
    select: (_cols: string) => builder,
    eq(col: string, val: unknown) {
      filters.push({ method: 'eq', col, val });
      return builder;
    },
    order(_col: string, _opts?: { ascending?: boolean }) {
      // chain no-op para el mock; el orden no afecta tests
      return builder;
    },
    maybeSingle: async <T,>(): Promise<{ data: T | null; error: null }> => {
      const rows = applyFilters(table, filters);
      return { data: (rows[0] as T) ?? null, error: null };
    },
    then<T>(resolve: (v: { data: Array<Record<string, unknown>>; error: null }) => T) {
      // Multi-row query (sin maybeSingle) — devuelve array filtrado
      const rows = applyFilters(table, filters);
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
    upsert(payload: Record<string, unknown>, _opts?: unknown) {
      state.upsertCalls.push({ table, payload });
      if (table === 'trainer_preferences') {
        const tenantId = payload.tenant_id as number;
        const idx = state.prefs.findIndex((p) => p.tenant_id === tenantId);
        if (idx >= 0) {
          state.prefs[idx] = { ...state.prefs[idx]!, ...payload } as FixturePrefsRow;
        } else {
          state.prefs.push({
            id: state.nextInsertId++,
            tenant_id: tenantId,
            preferences: payload.preferences,
            updated_by: (payload.updated_by as string | null) ?? null,
            updated_at: new Date().toISOString(),
          });
        }
      }
      return {
        then: <T,>(resolve: (v: { error: null }) => T) =>
          Promise.resolve({ error: null }).then(resolve),
      };
    },
    update(payload: Record<string, unknown>) {
      const updateFilters: Array<{ col: string; val: unknown }> = [];
      const chain = {
        eq(col: string, val: unknown) {
          updateFilters.push({ col, val });
          if (table === 'prompt_blocks') {
            for (const b of state.blocks) {
              if (updateFilters.every((f) => (b as unknown as Record<string, unknown>)[f.col] === f.val)) {
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
    insert(payload: Record<string, unknown>) {
      const id = state.nextInsertId++;
      const fullRec = { id, ...payload };
      if (table === 'prompt_blocks') {
        state.blocks.push(fullRec as unknown as FixtureBlockRow);
      }
      return {
        select: (_cols: string) => ({
          maybeSingle: async () => ({ data: fullRec, error: null }),
        }),
        then: <T,>(resolve: (v: { error: null }) => T) =>
          Promise.resolve({ error: null }).then(resolve),
      };
    },
  };

  return builder;
}

function applyFilters(
  table: string,
  filters: Array<{ method: 'eq'; col: string; val: unknown }>,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> =
    table === 'trainer_preferences'
      ? (state.prefs as unknown as Array<Record<string, unknown>>)
      : table === 'prompt_blocks'
        ? (state.blocks as unknown as Array<Record<string, unknown>>)
        : [];
  return rows.filter((r) => filters.every((f) => r[f.col] === f.val));
}

beforeEach(() => {
  state.prefs = [];
  state.blocks = [];
  state.nextInsertId = 100;
  state.upsertCalls = [];
  mockEffectiveTenant = {
    userId: 'trainer-user',
    tenantId: 3,
    isAgencyAdmin: false,
    isImpersonating: false,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
});

import { loadTrainerPreferences, saveTrainerPreferences } from '@/lib/actions/prompts';
import { DEFAULT_TRAINER_PREFERENCES } from '@/lib/trainer-prefs-serializer';

describe('loadTrainerPreferences', () => {
  it('returns defaults when no row exists', async () => {
    const r = await loadTrainerPreferences({ tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preferences).toEqual(DEFAULT_TRAINER_PREFERENCES);
  });

  it('returns saved preferences when row exists', async () => {
    state.prefs.push({
      id: 1,
      tenant_id: 3,
      preferences: { doubleQuestionMark: true, emojiDensity: 3, extraQuestionsBeforeCall: 1, preferVoiceNotesAcknowledgment: true },
      updated_by: null,
      updated_at: new Date().toISOString(),
    });
    const r = await loadTrainerPreferences({ tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preferences.doubleQuestionMark).toBe(true);
      expect(r.preferences.emojiDensity).toBe(3);
      expect(r.preferences.extraQuestionsBeforeCall).toBe(1);
      expect(r.preferences.preferVoiceNotesAcknowledgment).toBe(true);
    }
  });

  it('parses defensively: corrupted JSON falls back to defaults', async () => {
    state.prefs.push({
      id: 1,
      tenant_id: 3,
      preferences: { emojiDensity: 99, extraQuestionsBeforeCall: 'not-a-number' },
      updated_by: null,
      updated_at: new Date().toISOString(),
    });
    const r = await loadTrainerPreferences({ tenantId: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Valores inválidos → defaults
      expect(r.preferences.emojiDensity).toBe(DEFAULT_TRAINER_PREFERENCES.emojiDensity);
      expect(r.preferences.extraQuestionsBeforeCall).toBe(
        DEFAULT_TRAINER_PREFERENCES.extraQuestionsBeforeCall,
      );
    }
  });

  it('forbids cross-tenant access for non-admin', async () => {
    // Trainer tenantId=3 intenta leer prefs del tenant 5
    const r = await loadTrainerPreferences({ tenantId: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
  });

  it('agency admin can read any tenant prefs', async () => {
    mockEffectiveTenant = {
      userId: 'admin-user',
      tenantId: 1,
      isAgencyAdmin: true,
      isImpersonating: false,
    };
    state.prefs.push({
      id: 1,
      tenant_id: 7,
      preferences: { emojiDensity: 0 },
      updated_by: null,
      updated_at: new Date().toISOString(),
    });
    const r = await loadTrainerPreferences({ tenantId: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preferences.emojiDensity).toBe(0);
  });
});

describe('saveTrainerPreferences', () => {
  it('UPSERTs trainer_preferences + INSERTs trainer_prefs_v1 prompt_blocks markdown (first time)', async () => {
    const newPrefs = {
      doubleQuestionMark: true,
      emojiDensity: 3 as const,
      extraQuestionsBeforeCall: 2 as const,
      preferVoiceNotesAcknowledgment: true,
      trainerName: null,
      trainerEmail: null,
      trainerPhone: null,
      customInstructions: null,
    };

    const r = await saveTrainerPreferences({ tenantId: 3, preferences: newPrefs });
    expect(r.ok).toBe(true);

    // trainer_preferences upserteado
    expect(state.prefs).toHaveLength(1);
    expect(state.prefs[0]!.tenant_id).toBe(3);

    // prompt_blocks trainer_prefs_v1 INSERTado (no existía antes)
    const promptBlock = state.blocks.find(
      (b) => b.block_key === 'trainer_prefs_v1' && b.tenant_id === 3,
    );
    expect(promptBlock).toBeDefined();
    expect(promptBlock!.sort_order).toBe(110);
    expect(promptBlock!.content).toContain('Doble interrogación');
    expect(promptBlock!.content).toContain('densidad alta');
    expect(promptBlock!.content).toContain('2 preguntas adicionales');
    expect(promptBlock!.content).toContain('Acknowledge audios');
  });

  it('UPDATEs existing trainer_prefs_v1 prompt_blocks if it already existed', async () => {
    state.blocks.push({
      id: 200,
      block_key: 'trainer_prefs_v1',
      tenant_id: 3,
      content: 'OLD MARKDOWN',
      sort_order: 110,
      version: 1,
      is_active: true,
      updated_at: new Date('2026-01-01').toISOString(),
    });

    const r = await saveTrainerPreferences({
      tenantId: 3,
      preferences: { ...DEFAULT_TRAINER_PREFERENCES, doubleQuestionMark: true },
    });
    expect(r.ok).toBe(true);
    expect(state.blocks).toHaveLength(1);
    const updated = state.blocks[0]!;
    expect(updated.id).toBe(200);
    expect(updated.content).toContain('Doble interrogación');
    expect(updated.content).not.toBe('OLD MARKDOWN');
  });

  it('rejects non-admin trying to save another tenant prefs', async () => {
    const r = await saveTrainerPreferences({
      tenantId: 99,
      preferences: DEFAULT_TRAINER_PREFERENCES,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/);
  });

  it('agency admin can save any tenant prefs', async () => {
    mockEffectiveTenant = {
      userId: 'admin-user',
      tenantId: 1,
      isAgencyAdmin: true,
      isImpersonating: false,
    };
    const r = await saveTrainerPreferences({
      tenantId: 7,
      preferences: { ...DEFAULT_TRAINER_PREFERENCES, emojiDensity: 0 },
    });
    expect(r.ok).toBe(true);
    expect(state.prefs[0]!.tenant_id).toBe(7);
  });

  it('parses defensively: invalid values in input are sanitized before save', async () => {
    const r = await saveTrainerPreferences({
      tenantId: 3,
      preferences: {
        // @ts-expect-error: simulamos cliente malicioso enviando valor fuera de rango
        emojiDensity: 99,
        // @ts-expect-error
        extraQuestionsBeforeCall: -5,
        doubleQuestionMark: true,
        preferVoiceNotesAcknowledgment: false,
      },
    });
    expect(r.ok).toBe(true);
    // El parse defensive reemplazó valores inválidos por defaults antes de guardar
    const saved = state.prefs[0]!.preferences as Record<string, unknown>;
    expect(saved.emojiDensity).toBe(DEFAULT_TRAINER_PREFERENCES.emojiDensity);
    expect(saved.extraQuestionsBeforeCall).toBe(DEFAULT_TRAINER_PREFERENCES.extraQuestionsBeforeCall);
    expect(saved.doubleQuestionMark).toBe(true);
  });
});
