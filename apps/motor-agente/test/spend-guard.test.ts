import { describe, it, expect, vi } from 'vitest';
import {
  checkTenantSpend,
  enforceConversationTurnCap,
  SPEND_SPIKE_EVENT_KIND,
  TURN_CAP_EVENT_KIND,
} from '../src/services/spend-guard.js';

/**
 * 2026-11-12 — Frenos de gasto. Los bucles de las conversaciones 15128 y 14378
 * (tenant 7) costaron ~125 $ sin que nada los parara. Estos tests fijan los dos
 * techos: turnos por conversación en 24 h y gasto por cliente en una hora.
 */

const NOW = new Date('2026-11-12T12:00:00Z');
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

interface FakeState {
  pipelineRunsCount?: number;
  pipelineRunsError?: string;
  llmCalls?: Array<{ tenant_id: number; cost: number | null }>;
  aiEnabled?: Record<number, boolean>;
  recentEvents?: Array<{ tenant_id: number; created_at: string; payload: Record<string, unknown> }>;
}

function makeSupabase(state: FakeState) {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op: 'select' | 'update' | 'insert' = 'select';
      let updatePayload: Record<string, unknown> = {};
      const resolve = () => {
        if (op === 'update') {
          updates.push({ table, payload: updatePayload, filters: { ...filters } });
          return { data: null, error: null };
        }
        if (op === 'insert') return { data: null, error: null };
        if (table === 'pipeline_runs') {
          if (state.pipelineRunsError) return { data: null, count: null, error: { message: state.pipelineRunsError } };
          return { data: null, count: state.pipelineRunsCount ?? 0, error: null };
        }
        if (table === 'llm_calls') return { data: state.llmCalls ?? [], error: null };
        if (table === 'notification_events') {
          return {
            data: (state.recentEvents ?? []).filter((e) => e.tenant_id === filters.tenant_id),
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return b;
        },
        gte: () => b,
        not: () => b,
        order: () => b,
        limit: () => b,
        update: (payload: Record<string, unknown>) => {
          op = 'update';
          updatePayload = payload;
          return b;
        },
        insert: (payload: unknown) => {
          op = 'insert';
          inserts.push({ table, payload });
          return b;
        },
        maybeSingle: () => {
          if (table === 'tenant_configs') {
            const t = Number(filters.tenant_id);
            return Promise.resolve({ data: { ai_enabled: state.aiEnabled?.[t] ?? true }, error: null });
          }
          return Promise.resolve(resolve());
        },
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
      };
      return b;
    },
  } as any;
  return { supabase, updates, inserts };
}

describe('enforceConversationTurnCap — freno por conversación', () => {
  it('por debajo del tope deja pasar el turno y no toca nada', async () => {
    const { supabase, updates, inserts } = makeSupabase({ pipelineRunsCount: 26 });
    const out = await enforceConversationTurnCap({
      supabase, tenantId: 7, conversationId: 14228, maxTurns: 40, now: NOW, log,
    });
    expect(out).toEqual({ capped: false, turns: 26 });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it('en el tope pausa la IA en esa conversación y avisa a los admins', async () => {
    const { supabase, updates, inserts } = makeSupabase({ pipelineRunsCount: 40 });
    const out = await enforceConversationTurnCap({
      supabase, tenantId: 7, conversationId: 15128, maxTurns: 40, now: NOW, log,
    });
    expect(out).toEqual({ capped: true, turns: 40 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'conversations',
      payload: { ai_paused_until: 'infinity' },
      filters: { id: 15128, tenant_id: 7 },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.payload).toMatchObject({
      tenant_id: 7,
      event_type: 'error_motor',
      status: 'pending',
      payload: { kind: TURN_CAP_EVENT_KIND, conversation_id: 15128, turns_24h: 40, max_turns_24h: 40 },
    });
  });

  it('si no puede contar, deja pasar el turno (un fallo de lectura no apaga al setter)', async () => {
    const { supabase, updates } = makeSupabase({ pipelineRunsError: 'timeout' });
    const out = await enforceConversationTurnCap({
      supabase, tenantId: 7, conversationId: 1, maxTurns: 40, now: NOW, log,
    });
    expect(out).toEqual({ capped: false, turns: null });
    expect(updates).toEqual([]);
  });
});

describe('checkTenantSpend — freno por cliente', () => {
  const thresholds = { alertUsdPerHour: 3, pauseUsdPerHour: 8 };

  it('un gasto normal (la peor hora real de Tania, 1,41 $) no hace nada', async () => {
    const { supabase, updates, inserts } = makeSupabase({
      llmCalls: [{ tenant_id: 7, cost: 0.9 }, { tenant_id: 7, cost: 0.51 }],
    });
    const out = await checkTenantSpend({ supabase, ...thresholds, now: () => NOW, log });
    expect(out.tenantsOverAlert).toBe(0);
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it('por encima del aviso: un correo, sin apagar la IA', async () => {
    const { supabase, updates, inserts } = makeSupabase({
      llmCalls: Array.from({ length: 200 }, () => ({ tenant_id: 7, cost: 0.02 })), // 4 $
    });
    const out = await checkTenantSpend({ supabase, ...thresholds, now: () => NOW, log });
    expect(out).toMatchObject({ tenantsOverAlert: 1, alerted: 1, paused: 0 });
    expect(updates).toEqual([]);
    expect(inserts[0]!.payload).toMatchObject({
      tenant_id: 7,
      event_type: 'error_motor',
      payload: { kind: SPEND_SPIKE_EVENT_KIND, action: 'alert', spend_last_hour_usd: 4 },
    });
  });

  it('el aviso no se repite dentro de la misma hora', async () => {
    const { supabase, inserts } = makeSupabase({
      llmCalls: [{ tenant_id: 7, cost: 4 }],
      recentEvents: [
        { tenant_id: 7, created_at: '2026-11-12T11:40:00Z', payload: { kind: SPEND_SPIKE_EVENT_KIND } },
      ],
    });
    const out = await checkTenantSpend({ supabase, ...thresholds, now: () => NOW, log });
    expect(out).toMatchObject({ alerted: 0, skipped: 1 });
    expect(inserts).toEqual([]);
  });

  it('por encima del apagado: apaga la IA del cliente y avisa siempre', async () => {
    const { supabase, updates, inserts } = makeSupabase({
      llmCalls: [{ tenant_id: 7, cost: 9.5 }, { tenant_id: 2, cost: 0.4 }],
      recentEvents: [
        { tenant_id: 7, created_at: '2026-11-12T11:40:00Z', payload: { kind: SPEND_SPIKE_EVENT_KIND } },
      ],
    });
    const out = await checkTenantSpend({ supabase, ...thresholds, now: () => NOW, log });
    expect(out).toMatchObject({ tenantsOverAlert: 1, alerted: 1, paused: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'tenant_configs',
      payload: { ai_enabled: false },
      filters: { tenant_id: 7 },
    });
    expect(inserts[0]!.payload.payload).toMatchObject({ kind: SPEND_SPIKE_EVENT_KIND, action: 'paused' });
  });

  it('si la IA ya estaba apagada no la vuelve a tocar', async () => {
    const { supabase, updates } = makeSupabase({
      llmCalls: [{ tenant_id: 7, cost: 12 }],
      aiEnabled: { 7: false },
    });
    const out = await checkTenantSpend({ supabase, ...thresholds, now: () => NOW, log });
    expect(out.paused).toBe(0);
    expect(updates).toEqual([]);
  });
});
