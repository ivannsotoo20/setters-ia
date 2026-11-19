import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Idiomas que atiende la entrenadora (2026-11-19, Tania: "no quiero que converse
// en italiano"; conv. 13067, donde la IA le dijo a una italiana que Tania hace
// las videollamadas en italiano). Con `lead_qualification.languages`:
//   - quien escribe en otro idioma recibe el aviso de idiomas, del motor, sin modelo;
//   - si sigue en ese idioma tras el aviso, IA pausada + aviso a la entrenadora;
//   - un turno del modelo en un idioma no atendido no sale: sale el aviso.
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
    loadLeadQualification: async () => ({ languages: { allowed: ['es', 'pt', 'en', 'fr'] } }),
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

const ITALIANO =
  'Ciao soffro di mal di schiena/ anca da un po di anni! Lo scorso Dicembre però ho scoperto di avere un ernia l4';
const AVISO =
  'Perdona, por aquí solo puedo atenderte en castellano, portugués, inglés o francés. Podemos seguir en alguno de ellos?';

function turnOutput(text: string) {
  return {
    parts: [text],
    generator: {
      setterOutput: { message_raw: text, conversation_status: 'active', phase_decision: 2 },
      usage: {},
      model: 'claude-sonnet-5',
    },
    judge: { decision: 'pass', violations: [] },
    validator: { ok: true, violations: [], finalText: text },
    stages: [],
    totals: { costUsd: 0.03, latencyMs: 9000, tokensInTotal: 50_000, tokensOutTotal: 80 },
  };
}

beforeEach(() => {
  runPipelineMock.mockReset();
  loadHistoryMock.mockReset();
  enqueueNotificationMock.mockReset().mockResolvedValue({ ok: true, id: 1 });
  completePipelineRunMock.mockReset().mockResolvedValue(undefined);
  turnCapMock.mockReset().mockResolvedValue({ capped: false, turns: 3 });
});

const scheduled = (inserts: Array<{ table: string; payload: unknown }>) =>
  inserts
    .filter((i) => i.table === 'message_schedules')
    .flatMap((i) => (i.payload as Array<{ message: string }>).map((r) => r.message));

describe('processDebounced — idiomas que atiende la entrenadora', () => {
  it('escribe en italiano: sale el aviso de idiomas sin llamar al modelo', async () => {
    loadHistoryMock.mockResolvedValue([{ role: 'user', content: ITALIANO }]);
    const { supabase, inserts } = makeFakeSupabase('active');

    const out = await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(out.parts).toEqual([AVISO]);
    expect(scheduled(inserts)).toEqual([AVISO]);
    expect(completePipelineRunMock).toHaveBeenCalledTimes(1);
  });

  it('sigue en italiano tras el aviso: IA pausada, aviso a la entrenadora, nada a la persona', async () => {
    loadHistoryMock.mockResolvedValue([
      { role: 'user', content: ITALIANO },
      { role: 'assistant', content: AVISO },
      { role: 'user', content: 'Non ho capito bene, posso scrivere in italiano? Grazie mille' },
    ]);
    const { supabase, inserts, updates } = makeFakeSupabase('active');

    const out = await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
    expect(scheduled(inserts)).toEqual([]);
    const pause = updates.find((u) => u.table === 'conversations' && u.payload.ai_paused_until === 'infinity');
    expect(pause?.payload.is_handoff_to_human).toBe(true);
    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotificationMock.mock.calls[0]![0].payload.handoff_cause).toMatch(/italiano/);
  });

  it('tras el aviso contesta en castellano: conversación normal con el modelo', async () => {
    loadHistoryMock.mockResolvedValue([
      { role: 'user', content: ITALIANO },
      { role: 'assistant', content: AVISO },
      { role: 'user', content: 'Sí, podemos seguir en español, lo entiendo bastante bien' },
    ]);
    runPipelineMock.mockResolvedValue(turnOutput('Genial! Cuéntame, desde cuándo te duele?'));
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    expect(scheduled(inserts)).toEqual(['Genial! Cuéntame, desde cuándo te duele?']);
  });

  it('si el modelo contesta en italiano a una conversación en castellano, sale el aviso', async () => {
    loadHistoryMock.mockResolvedValue([{ role: 'user', content: 'Hola, me duele mucho la espalda desde hace años' }]);
    runPipelineMock.mockResolvedValue(
      turnOutput('Tranquilla, Tania fa le videochiamate anche in italiano, quindi non ti preoccupare per la lingua 😊'),
    );
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(scheduled(inserts)).toEqual([AVISO]);
  });
});
