import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// process-debounced con la zona rechazada por el prefijo (2026-09-26).
//
// Dos cosas que tienen que pasar en producción y que ningún test cubría:
//   1. La focal que recibe el pipeline es la del CIERRE por residencia, no la de
//      la fase (conv 12203: la focal "FASE 1…" ganó a la directiva de zona y el
//      setter siguió 24 mensajes con un +57).
//   2. Si el pipeline tumba el turno por V21 (no cerró) o V20 (insistió en el
//      enlace), processDebounced NO relanza: el cron reencolaría la conversación
//      cada 30 s sin límite. Se pausa la IA, se avisa a la entrenadora y no sale
//      nada a la persona.
// =============================================================================

const runPipelineMock = vi.fn();
const loadHistoryMock = vi.fn();
const enqueueNotificationMock = vi.fn();
const failPipelineRunMock = vi.fn();
const evaluateZoneMock = vi.fn();

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
  completePipelineRun: async () => undefined,
  failPipelineRun: (...args: unknown[]) => failPipelineRunMock(...args),
  classifyPipelineError: () => 'pipeline_error',
}));

vi.mock('../src/services/notify-trainer.js', () => ({
  enqueueNotification: (...args: unknown[]) => enqueueNotificationMock(...args),
}));

// Parcial: lead-origin.ts importa constantes de este módulo y tienen que seguir
// siendo las reales.
vi.mock('../src/lib/zone-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/zone-policy.js')>();
  return {
    ...actual,
    loadZonePolicy: async () => ({ noContactCountries: new Set(['CO']), countryRejectTerms: [] }),
    evaluateZone: (...args: unknown[]) => evaluateZoneMock(...args),
  };
});

const { processDebounced, zoneCloseFailureRule } = await import(
  '../src/services/process-debounced.js'
);
const { ZoneCloseError } = await import('@fyzon/agent-pipeline');

const REJECT_CO = {
  kind: 'reject_by_prefix',
  country: { iso: 'CO', name: 'Colombia', prefix: '57' },
} as const;

/** Supabase falso por tabla. Registra los UPDATE de `conversations`. */
function makeFakeSupabase() {
  const conversationUpdates: Array<Record<string, unknown>> = [];
  const rows: Record<string, unknown> = {
    conversations: {
      id: 12203,
      tenant_id: 7,
      lead_id: 500,
      channel_id: 3,
      phase_number: 1,
      state: 'active',
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
      phone: '+573001234567',
      email: null,
      timezone: 'America/Bogota',
    },
    integration_accounts: { id: 5 },
    channels: { channel_type: 'instagram_dm' },
    tenant_configs: { default_audio_language: 'es' },
    trainer_preferences: null,
  };
  const supabase = {
    from(table: string) {
      let isUpdate = false;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => {
          isUpdate = true;
          if (table === 'conversations') conversationUpdates.push(payload);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: isUpdate ? null : rows[table] ?? null, error: null }).then(resolve),
      };
      return builder;
    },
  } as any;
  return { supabase, conversationUpdates };
}

const HISTORY = [
  { role: 'user', content: 'Hola, vi tu vídeo de la espalda' },
];

beforeEach(() => {
  runPipelineMock.mockReset();
  loadHistoryMock.mockReset().mockResolvedValue(HISTORY);
  enqueueNotificationMock.mockReset().mockResolvedValue({ ok: true, id: 1 });
  failPipelineRunMock.mockReset().mockResolvedValue(undefined);
  evaluateZoneMock.mockReset().mockReturnValue(REJECT_CO);
});

describe('processDebounced — zona rechazada por prefijo', () => {
  it('pasa al pipeline la focal de cierre por residencia y zoneRejected, sin tocar el enlace', async () => {
    runPipelineMock.mockRejectedValue(new ZoneCloseError({ conversation_status: 'active' }));
    const { supabase } = makeFakeSupabase();

    await processDebounced({ supabase, anthropic: {} as any }, 12203);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.composeOverrides.currentPhaseFocus).toContain('ESTE TURNO CIERRA POR RESIDENCIA');
    expect(input.composeOverrides.currentPhaseFocus).not.toContain('FASE 1');
    expect(input.validationContext.zoneRejected).toBe(true);
    // Un null caería al respaldo SIN_CALENDARIO del coach (otra rama del prompt).
    expect(input.composeOverrides.trackedCalendarUrl).toBe(
      'https://example.test/booking?fyzon_lead_uuid=abc',
    );
  });

  it('V21: no relanza; pausa la IA, marca handoff y avisa a la entrenadora', async () => {
    runPipelineMock.mockRejectedValue(new ZoneCloseError({ conversation_status: 'active' }));
    const { supabase, conversationUpdates } = makeFakeSupabase();

    const out = await processDebounced({ supabase, anthropic: {} as any }, 12203);

    expect(out.skipped).toBe(true);
    expect(out.parts).toEqual([]);
    expect(out.scheduleIds).toEqual([]);
    expect(out.pipelineStatus).toBe('handoff');
    expect(failPipelineRunMock).toHaveBeenCalledTimes(1);

    const pause = conversationUpdates.find((u) => u.ai_paused_until === 'infinity');
    expect(pause).toBeDefined();
    expect(pause!.is_handoff_to_human).toBe(true);
    // El estado no se cierra: el siguiente mensaje de la persona tiene que caer
    // en esta conversación, no abrir otra en F1.
    expect(pause!.state).toBeUndefined();

    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
    const notif = enqueueNotificationMock.mock.calls[0]![0];
    expect(notif.eventType).toBe('handoff');
    expect(notif.payload.conversation_id).toBe(12203);
    expect(String(notif.payload.handoff_cause)).toContain('Fuera de zona');
  });

  it('V20 (enlace insistente tras el reintento): mismo aterrizaje', async () => {
    runPipelineMock.mockRejectedValue(
      new Error(
        'Validator V0-V20 found unrecoverable errors after Judge: V20: la persona no cualifica por residencia y el turno lleva un enlace: "https://x.test"',
      ),
    );
    const { supabase, conversationUpdates } = makeFakeSupabase();

    const out = await processDebounced({ supabase, anthropic: {} as any }, 12203);

    expect(out.skipped).toBe(true);
    expect(conversationUpdates.some((u) => u.ai_paused_until === 'infinity')).toBe(true);
    expect(enqueueNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('un error que no es de zona se relanza como siempre (el cron reintenta)', async () => {
    runPipelineMock.mockRejectedValue(new Error('Judge rejected message: tono'));
    const { supabase, conversationUpdates } = makeFakeSupabase();

    await expect(processDebounced({ supabase, anthropic: {} as any }, 12203)).rejects.toThrow(
      /Judge rejected/,
    );
    expect(conversationUpdates.some((u) => u.ai_paused_until === 'infinity')).toBe(false);
    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });
});

describe('processDebounced — sin zona rechazada', () => {
  it('la focal es la de la fase y un V21 improbable no se trata como zona', async () => {
    evaluateZoneMock.mockReturnValue({ kind: 'clear' });
    runPipelineMock.mockRejectedValue(new ZoneCloseError({ conversation_status: 'active' }));
    const { supabase, conversationUpdates } = makeFakeSupabase();

    await expect(processDebounced({ supabase, anthropic: {} as any }, 12203)).rejects.toThrow(
      /^V21/,
    );
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.composeOverrides.currentPhaseFocus).toContain('AHORA ESTÁS EN FASE 1');
    expect(input.validationContext.zoneRejected).toBe(false);
    expect(conversationUpdates.some((u) => u.ai_paused_until === 'infinity')).toBe(false);
  });
});

describe('zoneCloseFailureRule', () => {
  it('reconoce V21 por clase y por texto, y V20 por el texto del validador', () => {
    expect(zoneCloseFailureRule(new ZoneCloseError({ conversation_status: 'active' }))).toBe('V21');
    expect(zoneCloseFailureRule(new Error('V21: zona rechazada sin cierre (x)'))).toBe('V21');
    expect(
      zoneCloseFailureRule(
        new Error('Validator V0-V20 found unrecoverable errors after Judge: V20: enlace'),
      ),
    ).toBe('V20');
  });

  it('no confunde el prefijo "V0-V20 found" ni otros errores con zona', () => {
    expect(
      zoneCloseFailureRule(
        new Error('Validator V0-V20 found unrecoverable errors after Judge: V19: hueco'),
      ),
    ).toBeNull();
    expect(zoneCloseFailureRule(new Error('Judge rejected message: x'))).toBeNull();
    expect(zoneCloseFailureRule('V21: no es un Error')).toBeNull();
  });
});
