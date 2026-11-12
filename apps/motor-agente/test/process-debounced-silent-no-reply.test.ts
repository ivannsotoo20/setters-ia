import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// No contestar en una conversación ya cerrada (2026-11-12).
//
// Conversación 15128 (tenant 7): lead fuera de zona, vídeo enviado y despedida
// hecha (estado 'stopped'). Ella escribe «Gracias 🫂» y el modelo, con razón, no
// dice nada. El validador lo trataba como error, el cron reencolaba cada 30 s y
// en tres días fueron ~5.200 llamadas pagadas. Ahora:
//   - el motor le dice al pipeline que la conversación está cerrada
//     (`allowSilentNoReply`), y
//   - si el turno vuelve vacío y sin handoff, no se manda nada y no se toca la
//     conversación.
// =============================================================================

const runPipelineMock = vi.fn();
const loadHistoryMock = vi.fn();
const enqueueNotificationMock = vi.fn();
const completePipelineRunMock = vi.fn();

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

function silentOutput(status: 'disqualified' | 'active') {
  return {
    parts: [],
    generator: {
      setterOutput: { message_raw: '', conversation_status: status, phase_decision: 3 },
      usage: {},
      model: 'claude-sonnet-5',
    },
    judge: { decision: 'pass', violations: [] },
    validator: { ok: true, violations: [], finalText: '' },
    stages: [],
    totals: { costUsd: 0.02, latencyMs: 900, tokensInTotal: 50_000, tokensOutTotal: 60 },
  };
}

beforeEach(() => {
  runPipelineMock.mockReset();
  loadHistoryMock.mockReset().mockResolvedValue([
    { role: 'assistant', content: 'Cuídate' },
    { role: 'user', content: 'Gracias 🫂' },
  ]);
  enqueueNotificationMock.mockReset().mockResolvedValue({ ok: true, id: 1 });
  completePipelineRunMock.mockReset().mockResolvedValue(undefined);
});

describe('processDebounced — no contestar en una conversación cerrada', () => {
  it('con la conversación cerrada el pipeline recibe allowSilentNoReply', async () => {
    runPipelineMock.mockResolvedValue(silentOutput('disqualified'));
    const { supabase } = makeFakeSupabase('stopped');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(runPipelineMock.mock.calls[0]![1].allowSilentNoReply).toBe(true);
  });

  it('con la conversación activa no', async () => {
    runPipelineMock.mockRejectedValue(new Error('Generator devolvió `message_raw` vacío'));
    const { supabase } = makeFakeSupabase('active');

    await expect(processDebounced({ supabase, anthropic: {} as any }, 15128)).rejects.toThrow(
      /vacío/,
    );
    expect(runPipelineMock.mock.calls[0]![1].allowSilentNoReply).toBe(false);
  });

  it('turno vacío sin handoff: no se manda nada, no se toca la conversación ni se avisa', async () => {
    runPipelineMock.mockResolvedValue(silentOutput('disqualified'));
    const { supabase, updates, inserts } = makeFakeSupabase('stopped');

    const out = await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(out.skipped).toBe(true);
    expect(out.reason).toMatch(/no contestar/);
    expect(out.parts).toEqual([]);
    expect(out.scheduleIds).toEqual([]);
    expect(out.phase).toBe(3);
    expect(inserts.filter((i) => i.table === 'message_schedules')).toEqual([]);
    const convUpdates = updates.filter((u) => u.table === 'conversations').map((u) => u.payload);
    expect(convUpdates.some((p) => 'state' in p || 'phase_number' in p)).toBe(false);
    expect(convUpdates.some((p) => p.ai_paused_until != null)).toBe(false);
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
    // El turno se cierra como completado (no queda zombie en pipeline_runs).
    expect(completePipelineRunMock).toHaveBeenCalledTimes(1);
  });
});
