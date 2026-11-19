import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Turno caducado (2026-11-19, Tania, conv. 15317).
//
// La persona contó «4 años» un segundo después de que el modelo terminara su
// turno, y el turno salió igual 30 s más tarde, repreguntando el tiempo de dolor.
// Si al terminar de generar la conversación ya está otra vez en la cola del
// debounce (`isRequeued`), un turno de conversación normal no se programa ni toca
// la conversación: lo rehace el turno siguiente con su mensaje nuevo. Un turno
// que cierra o deriva sale igual (no hay turno nuevo que lo sustituya).
// =============================================================================

vi.mock('../src/services/labels/index.js', () => ({
  applySystemLabels: async () => ({ errors: [] }),
}));

const runPipelineMock = vi.fn();
const loadHistoryMock = vi.fn();
const enqueueNotificationMock = vi.fn();
const completePipelineRunMock = vi.fn();
const turnCapMock = vi.fn();

vi.mock('../src/services/spend-guard.js', () => ({
  enforceConversationTurnCap: (...args: unknown[]) => turnCapMock(...args),
}));

vi.mock('@fyzon/agent-pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fyzon/agent-pipeline')>();
  return {
    ...actual,
    runPipeline: (...args: unknown[]) => runPipelineMock(...args),
    loadConversationHistory: (...args: unknown[]) => loadHistoryMock(...args),
  };
});

vi.mock('../src/lib/ai-enabled.js', () => ({
  isTenantAiEnabled: async () => true,
}));

vi.mock('../src/services/enrich-media-messages.js', () => ({
  enrichMediaMessages: async () => ({ costUsd: 0, audiosTranscribed: 0, imagesDescribed: 0 }),
}));

vi.mock('../src/services/tracked-calendar-url.js', () => ({
  getTrackedCalendarUrl: async () => 'https://example.test/booking?fyzon_lead_uuid=abc',
}));

vi.mock('../src/services/pipeline-runs.js', () => ({
  startPipelineRun: async () => ({ id: 99, correlationId: 'corr-1' }),
  completePipelineRun: (...args: unknown[]) => completePipelineRunMock(...args),
  failPipelineRun: async () => undefined,
  classifyPipelineError: () => 'pipeline_error',
}));

vi.mock('../src/services/notify-trainer.js', () => ({
  enqueueNotification: (...args: unknown[]) => enqueueNotificationMock(...args),
}));

vi.mock('../src/lib/zone-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/zone-policy.js')>();
  return {
    ...actual,
    loadLeadQualification: async () => null,
    evaluateZone: () => ({ kind: 'clear' }),
  };
});

const { processDebounced } = await import('../src/services/process-debounced.js');

/** Supabase falso por tabla. Registra los UPDATE e INSERT. */
function makeFakeSupabase(state: string) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const rows: Record<string, unknown> = {
    conversations: {
      id: 15128,
      tenant_id: 7,
      lead_id: 500,
      channel_id: 3,
      phase_number: 3,
      state,
      ai_paused_until: null,
      conversation_source: 'inbound',
      direction: 'inbound',
      custom_fields: null,
    },
    leads: {
      id: 500,
      external_id: 'ig_1',
      first_name: 'Ana',
      last_name: null,
      phone: null,
      email: null,
      timezone: null,
    },
    integration_accounts: { id: 5 },
    channels: { channel_type: 'instagram_dm' },
    tenant_configs: { default_audio_language: 'es' },
    trainer_preferences: null,
  };
  const supabase = {
    from(table: string) {
      let isWrite = false;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => {
          isWrite = true;
          updates.push({ table, payload });
          return builder;
        },
        insert: (payload: unknown) => {
          isWrite = true;
          inserts.push({ table, payload });
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
        single: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: isWrite ? null : rows[table] ?? null, error: null }).then(resolve),
      };
      return builder;
    },
  } as any;
  return { supabase, updates, inserts };
}

function turnOutput(status: 'active' | 'disqualified', extra: Record<string, unknown> = {}) {
  return {
    parts: ['Entiendo, 4 años ya es mucho tiempo', 'Y qué es lo que más le limita en su día a día?'],
    generator: {
      setterOutput: {
        message_raw:
          'Entiendo, 4 años ya es mucho tiempo\n\nY qué es lo que más le limita en su día a día?',
        conversation_status: status,
        phase_decision: 2,
        ...extra,
      },
      usage: {},
      model: 'claude-sonnet-5',
    },
    judge: { decision: 'pass', violations: [] },
    validator: { ok: true, violations: [], finalText: '' },
    stages: [],
    totals: { costUsd: 0.03, latencyMs: 9000, tokensInTotal: 50_000, tokensOutTotal: 80 },
  };
}

beforeEach(() => {
  runPipelineMock.mockReset();
  loadHistoryMock.mockReset().mockResolvedValue([
    { role: 'assistant', content: 'Desde cuándo le persiste el dolor tras la operación?' },
    { role: 'user', content: 'Exacto' },
  ]);
  enqueueNotificationMock.mockReset().mockResolvedValue({ ok: true, id: 1 });
  completePipelineRunMock.mockReset().mockResolvedValue(undefined);
  turnCapMock.mockReset().mockResolvedValue({ capped: false, turns: 3 });
});

const schedulesOf = (inserts: Array<{ table: string }>) =>
  inserts.filter((i) => i.table === 'message_schedules');

describe('processDebounced — turno caducado', () => {
  it('si la persona escribió mientras se generaba, el turno normal no sale ni toca la conversación', async () => {
    runPipelineMock.mockResolvedValue(turnOutput('active'));
    const { supabase, updates, inserts } = makeFakeSupabase('active');
    const isRequeued = vi.fn().mockResolvedValue(true);

    const out = await processDebounced({ supabase, anthropic: {} as any, isRequeued }, 15128);

    expect(isRequeued).toHaveBeenCalledWith(15128);
    expect(out.skipped).toBe(true);
    expect(out.reason).toMatch(/turno caducado/);
    expect(out.parts).toEqual([]);
    expect(schedulesOf(inserts)).toEqual([]);
    const convUpdates = updates.filter((u) => u.table === 'conversations').map((u) => u.payload);
    expect(convUpdates.some((p) => 'state' in p || 'phase_number' in p)).toBe(false);
    expect(completePipelineRunMock).toHaveBeenCalledTimes(1);
  });

  it('sin mensaje nuevo, el turno sale como siempre', async () => {
    runPipelineMock.mockResolvedValue(turnOutput('active'));
    const { supabase, inserts } = makeFakeSupabase('active');

    const out = await processDebounced(
      { supabase, anthropic: {} as any, isRequeued: async () => false },
      15128,
    );

    expect(out.skipped).toBeFalsy();
    expect(schedulesOf(inserts)).toHaveLength(1);
  });

  it('sin la comprobación (tests, scripts) el turno sale como siempre', async () => {
    runPipelineMock.mockResolvedValue(turnOutput('active'));
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(schedulesOf(inserts)).toHaveLength(1);
  });

  it('un turno que cierra (descalificada) sale aunque haya mensaje nuevo', async () => {
    runPipelineMock.mockResolvedValue(turnOutput('disqualified'));
    const { supabase, inserts } = makeFakeSupabase('active');
    const isRequeued = vi.fn().mockResolvedValue(true);

    await processDebounced({ supabase, anthropic: {} as any, isRequeued }, 15128);

    expect(isRequeued).not.toHaveBeenCalled();
    expect(schedulesOf(inserts)).toHaveLength(1);
  });

  it('si la comprobación falla, el turno sale (en la duda, se contesta)', async () => {
    runPipelineMock.mockResolvedValue(turnOutput('active'));
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced(
      {
        supabase,
        anthropic: {} as any,
        isRequeued: () => Promise.reject(new Error('redis')),
      },
      15128,
    );

    expect(schedulesOf(inserts)).toHaveLength(1);
  });
});
