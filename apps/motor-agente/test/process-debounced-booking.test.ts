import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Reserva solo con la cita REAL (2026-11-19, Tania, conv. 15147: «Listo» →
// «Pues ya está reservada 🙌» sin mirar el calendario). Con
// `lead_qualification.booking_confirmation`:
//   - «listo» tras el enlace y sin cita → se consulta el calendario; si aparece,
//     la confirmación la manda el motor (applier) y este turno no contesta;
//   - si no aparece, el modelo recibe «no hay cita registrada» y un turno que la
//     da por hecha se sustituye por el texto de «en cuanto aparezca».
// =============================================================================

vi.mock('../src/services/labels/index.js', () => ({
  applySystemLabels: async () => ({ errors: [] }),
}));

const syncMock = vi.fn();
vi.mock('../src/services/calendar-sync.js', () => ({
  syncCalendarAppointments: (...args: unknown[]) => syncMock(...args),
}));

const appointments: { current: unknown[] } = { current: [] };

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
    loadLeadQualification: async () => ({ booking_confirmation: { enabled: true } }),
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
        or: () => builder,
        gte: () => builder,
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
          Promise.resolve({
            data: isWrite ? null : table === 'calendar_appointments' ? appointments.current : rows[table] ?? null,
            error: null,
          }).then(resolve),
      };
      return builder;
    },
  } as any;
  return { supabase, updates, inserts };
}

const ENLACE = 'https://api.leadconnectorhq.com/widget/booking/Ur6y2sCkndEVLLQJ8n05?fyzon_lead_uuid=svcCMT43ULoBhLPz';
const PENDIENTE = 'Genial! En cuanto me aparezca la reserva en la agenda te la confirmo por aquí con el día y la hora 😊';

function turnOutput(text: string, phase = 6) {
  return {
    parts: [text],
    generator: {
      setterOutput: { message_raw: text, conversation_status: 'active', phase_decision: phase },
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
  loadHistoryMock.mockReset().mockResolvedValue([
    { role: 'assistant', content: ENLACE },
    { role: 'assistant', content: 'Cuando lo tengas dime y compruebo que haya quedado correctamente reservado 😊' },
    { role: 'user', content: 'Listo' },
  ]);
  enqueueNotificationMock.mockReset().mockResolvedValue({ ok: true, id: 1 });
  completePipelineRunMock.mockReset().mockResolvedValue(undefined);
  turnCapMock.mockReset().mockResolvedValue({ capped: false, turns: 3 });
  syncMock.mockReset().mockResolvedValue({});
  appointments.current = [];
});

const scheduled = (inserts: Array<{ table: string; payload: unknown }>) =>
  inserts
    .filter((i) => i.table === 'message_schedules')
    .flatMap((i) => (i.payload as Array<{ message: string }>).map((r) => r.message));

describe('processDebounced — reserva solo con la cita real', () => {
  it('«Listo» y el calendario la tiene al consultarlo: el turno no contesta (la confirmación es del motor)', async () => {
    syncMock.mockImplementation(async () => {
      appointments.current = [{ id: 1536, start_at: '2026-11-16T16:00:00Z' }];
      return {};
    });
    const { supabase, inserts } = makeFakeSupabase('active');

    const out = await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0]![0]).toMatchObject({ tenantId: 7 });
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
    expect(out.reason).toMatch(/cita registrada/);
    expect(scheduled(inserts)).toEqual([]);
  });

  it('«Listo» sin cita: el modelo sabe que no consta y su «ya está reservada» no sale', async () => {
    runPipelineMock.mockResolvedValue(
      turnOutput('Pues ya está reservada 🙌 El enlace de la videollamada te llega automáticamente al correo.', 7),
    );
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(syncMock).toHaveBeenCalledTimes(1);
    const suffix = runPipelineMock.mock.calls[0]![1].composeOverrides.extraSystemSuffix as string;
    expect(suffix).toMatch(/NO hay ninguna cita registrada/);
    expect(scheduled(inserts)).toEqual([PENDIENTE]);
  });

  it('sin cita y un turno que no la da por hecha: sale tal cual', async () => {
    runPipelineMock.mockResolvedValue(turnOutput(PENDIENTE));
    const { supabase, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(scheduled(inserts)).toEqual([PENDIENTE]);
  });

  it('«Listo» sin cita y el modelo cierra como "ha reservado": sigue activa en F6', async () => {
    const out = turnOutput('Pues ya está reservada 🙌', 7);
    Object.assign(out.generator.setterOutput, { conversation_status: 'handoff', handoff_cause: 'A_agenda' });
    runPipelineMock.mockResolvedValue(out);
    const { supabase, updates, inserts } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(scheduled(inserts)).toEqual([PENDIENTE]);
    const conv = updates.filter((u) => u.table === 'conversations').map((u) => u.payload).find((p) => 'state' in p)!;
    expect(conv.state).toBe('active');
    expect(conv.is_handoff_to_human).toBe(false);
    expect(conv.phase_number).toBeLessThanOrEqual(6);
  });

  it('sin enlace enviado ni «listo», ni consulta al calendario ni directiva', async () => {
    loadHistoryMock.mockResolvedValue([
      { role: 'assistant', content: 'Desde cuándo te duele?' },
      { role: 'user', content: 'Hace dos años' },
    ]);
    runPipelineMock.mockResolvedValue(turnOutput('Entiendo, dos años ya es tiempo', 2));
    const { supabase } = makeFakeSupabase('active');

    await processDebounced({ supabase, anthropic: {} as any }, 15128);

    expect(syncMock).not.toHaveBeenCalled();
    const suffix = (runPipelineMock.mock.calls[0]![1].composeOverrides.extraSystemSuffix as string | null) ?? '';
    expect(suffix).not.toMatch(/cita registrada/);
  });
});
