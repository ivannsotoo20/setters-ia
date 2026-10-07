import { describe, it, expect, vi } from 'vitest';
import { CallGateError, callGateMiss, isCallStep, runPipeline } from '../src/pipeline.js';
import type { CallGate } from '../src/types.js';

/**
 * V22 — cerrojo de la videollamada (2026-10-07).
 *
 * Tania, tras meses con el mismo fallo: se seguían proponiendo y agendando
 * videollamadas a personas que no cualificaban por país o por tiempo de dolor.
 * El criterio estaba escrito en su bloque; aplicarlo dependía del modelo.
 *
 * Con `callGate`, un turno que lleva a la videollamada (fase 5-6, `qualified` o
 * la URL del calendario) tiene que declarar en la tool país de zona y dolor de
 * al menos N meses (o episodio anterior). Si no: UN reintento; si tampoco, el
 * turno se tumba con CallGateError y no sale nada.
 */

const URL_REAL =
  'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const PROPUESTA =
  'Por lo que me estás contando, creo que tendría sentido conocer un poco mejor tu caso y ver si realmente puedo ayudarte. Si te parece, podemos hacer una videollamada y valorarlo con más calma.';

const PREGUNTA_PAIS = 'Por cierto, ¿desde dónde me escribes? ¿Dónde vives ahora mismo?';
const PREGUNTA_TIEMPO = 'Y esto, ¿desde cuándo te viene pasando?';
const CIERRE_RECURSO = 'Te dejo por aquí un vídeo que te puede ayudar mucho a empezar a moverte con seguridad.';

const TANIA_GATE: CallGate = {
  allowedCountries: ['ES', 'FR', 'IT', 'DE', 'PT', 'GB', 'US', 'CA', 'MX', 'CL'],
  countryKnownInZone: false,
  minPainMonths: 3,
};

function makeFakeSupabase() {
  const promptBlocks = [
    { block_key: 'core_v5_base', sort_order: 0, tenant_id: null, content: '[CORE V5]' },
    { block_key: 'coach_v5', sort_order: 5, tenant_id: 7, content: '[COACH TANIA]' },
    { block_key: 'output_contract_v5', sort_order: 100, tenant_id: null, content: '[CONTRATO]' },
  ];
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        insert: () => builder,
        single: () => Promise.resolve({ data: { id: 1 }, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        or: () => Promise.resolve({ data: promptBlocks, error: null }),
      };
      if (table === 'prompt_blocks' || table === 'trainer_preferences' || table === 'llm_calls') {
        return builder;
      }
      throw new Error(`fake supabase: tabla inesperada ${table}`);
    },
  } as any;
}

const USAGE = { input_tokens: 10, output_tokens: 10 };

function setterReply(
  messageRaw: string,
  status: string,
  phase: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id: 'msg_gen',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tu_gen',
        name: 'respond_as_setter',
        input: { message_raw: messageRaw, conversation_status: status, phase_decision: phase, ...extra },
      },
    ],
    usage: USAGE,
  };
}

const JUDGE_PASS = {
  id: 'msg_judge',
  stop_reason: 'tool_use',
  content: [
    { type: 'tool_use', id: 'tu_judge', name: 'judge_message', input: { decision: 'pass', violations: [] } },
  ],
  usage: USAGE,
};

type Reply = ReturnType<typeof setterReply> | Error;

function makeAnthropic(generatorReplies: Reply[]) {
  const gens = [...generatorReplies];
  let splitterCalls = 0;
  const create = vi.fn(async (req: any) => {
    const toolName = req.tool_choice?.name;
    if (toolName === 'respond_as_setter') {
      const next = gens.shift();
      if (next === undefined) throw new Error('el test se quedó sin respuestas del Generator');
      if (next instanceof Error) throw next;
      return next;
    }
    if (toolName === 'judge_message') return JUDGE_PASS;
    splitterCalls += 1;
    throw new Error(`tool no simulada en el test: ${toolName}`);
  });
  const generatorCalls = () =>
    create.mock.calls.filter((c: any[]) => c[0].tool_choice?.name === 'respond_as_setter');
  return { anthropic: { messages: { create } } as any, generatorCalls, splitterCalls: () => splitterCalls };
}

function lastUserContent(call: any[]): string {
  const msgs = call[0].messages;
  return String(msgs[msgs.length - 1]?.content);
}

const baseInput = {
  tenantId: 7,
  conversationId: 13001,
  userMessage: 'Llevo así desde hace un año y ya no sé qué hacer',
  currentPhase: 4,
  history: [],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram' },
  callGate: TANIA_GATE,
  composeOverrides: { trackedCalendarUrl: URL_REAL },
};

describe('callGateMiss', () => {
  it('sin país declarado, o de fuera, no pasa', () => {
    expect(callGateMiss({ pain_duration_months: 12 }, TANIA_GATE)).toBe('country_unknown');
    expect(callGateMiss({ lead_country_iso: 'PE', pain_duration_months: 12 }, TANIA_GATE)).toBe('country_out');
  });

  it('con el país confirmado por el prefijo, el setter no tiene que declararlo', () => {
    const gate = { ...TANIA_GATE, countryKnownInZone: true };
    expect(callGateMiss({ pain_duration_months: 12 }, gate)).toBeNull();
  });

  it('dolor sin declarar o de menos de 3 meses no pasa; un episodio anterior sí', () => {
    expect(callGateMiss({ lead_country_iso: 'ES' }, TANIA_GATE)).toBe('pain_unknown');
    expect(callGateMiss({ lead_country_iso: 'ES', pain_duration_months: 1 }, TANIA_GATE)).toBe('pain_recent');
    expect(
      callGateMiss({ lead_country_iso: 'ES', pain_duration_months: 1, previous_episode: true }, TANIA_GATE),
    ).toBeNull();
    expect(callGateMiss({ lead_country_iso: 'es', pain_duration_months: 3 }, TANIA_GATE)).toBeNull();
  });

  it('lo que la config no exige no se mira', () => {
    expect(callGateMiss({}, { allowedCountries: null, countryKnownInZone: false, minPainMonths: null })).toBeNull();
    expect(callGateMiss({ pain_duration_months: 1 }, { ...TANIA_GATE, minPainMonths: null, countryKnownInZone: true })).toBeNull();
  });
});

describe('isCallStep', () => {
  it('fase 5 o 6, o qualified, llevan a la videollamada', () => {
    expect(isCallStep({ conversation_status: 'active', phase_decision: 5 }, 'x', null)).toBe(true);
    expect(isCallStep({ conversation_status: 'active', phase_decision: 6 }, 'x', null)).toBe(true);
    expect(isCallStep({ conversation_status: 'qualified', phase_decision: 4 }, 'x', null)).toBe(true);
  });

  it('el enlace del calendario en el texto cuenta aunque la fase diga otra cosa', () => {
    expect(isCallStep({ conversation_status: 'active', phase_decision: 3 }, `Aquí lo tienes: ${URL_REAL}`, URL_REAL)).toBe(true);
    // Basta con la URL base: el modelo a veces la pega sin los parámetros.
    expect(
      isCallStep(
        { conversation_status: 'active', phase_decision: 3 },
        'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka',
        URL_REAL,
      ),
    ).toBe(true);
  });

  it('cerrar, pasar a la entrenadora, pausar, F1-F4 y F7 no llevan a la videollamada', () => {
    expect(isCallStep({ conversation_status: 'disqualified', phase_decision: 5 }, 'x', null)).toBe(false);
    expect(isCallStep({ conversation_status: 'handoff', phase_decision: 6 }, 'x', null)).toBe(false);
    expect(isCallStep({ conversation_status: 'paused', phase_decision: 5 }, 'x', null)).toBe(false);
    expect(isCallStep({ conversation_status: 'active', phase_decision: 4 }, 'x', URL_REAL)).toBe(false);
    expect(isCallStep({ conversation_status: 'active', phase_decision: 7 }, 'x', null)).toBe(false);
  });
});

describe('pipeline — V22 cerrojo de la videollamada', () => {
  it('la tool lleva los campos del cerrojo solo cuando hay callGate', async () => {
    const withGate = makeAnthropic([setterReply('Cuéntame un poco más', 'active', 3)]);
    await runPipeline({ supabase: makeFakeSupabase(), anthropic: withGate.anthropic }, baseInput as any);
    const props = withGate.generatorCalls()[0]![0].tools[0].input_schema.properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['lead_country_iso', 'pain_duration_months', 'previous_episode']),
    );

    const noGate = makeAnthropic([setterReply('Cuéntame un poco más', 'active', 3)]);
    await runPipeline(
      { supabase: makeFakeSupabase(), anthropic: noGate.anthropic },
      { ...baseInput, callGate: undefined } as any,
    );
    const propsNoGate = noGate.generatorCalls()[0]![0].tools[0].input_schema.properties;
    expect(propsNoGate.lead_country_iso).toBeUndefined();
  });

  it('propuesta con país de zona y un año de dolor: sale sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { lead_country_iso: 'ES', pain_duration_months: 12 }),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
    expect(out.stages.find((s) => s.notes?.startsWith('V22'))).toBeUndefined();
    expect(out.parts.join(' ')).toContain('videollamada');
  });

  it('propuesta sin saber dónde vive: el reintento pregunta el país y eso es lo que sale', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { pain_duration_months: 12 }),
      setterReply(PREGUNTA_PAIS, 'active', 4, { pain_duration_months: 12 }),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(generatorCalls()).toHaveLength(2);
    expect(out.stages.find((s) => s.notes === 'V22_retry:country_unknown')).toBeDefined();
    const retryPrompt = lastUserContent(generatorCalls()[1]!);
    expect(retryPrompt).toContain('no has declarado en qué país vive');
    expect(retryPrompt).toContain('lead_country_iso');
    expect(out.parts.join(' ')).toContain('Dónde vives');
    expect(out.parts.join(' ')).not.toContain('videollamada');
    expect(out.generator.setterOutput.phase_decision).toBe(4);
  });

  it('si ya lo había dicho, el reintento devuelve la misma propuesta con el país declarado', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { pain_duration_months: 12 }),
      setterReply(PROPUESTA, 'active', 5, { lead_country_iso: 'ES', pain_duration_months: 12 }),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(2);
    expect(out.parts.join(' ')).toContain('videollamada');
    expect(out.generator.setterOutput.lead_country_iso).toBe('ES');
  });

  it('país de fuera (declarado por el propio setter): el reintento sigue el camino de fuera de zona', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { lead_country_iso: 'UY', pain_duration_months: 24 }),
      setterReply(CIERRE_RECURSO, 'disqualified', 4, { lead_country_iso: 'UY', pain_duration_months: 24 }),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.stages.find((s) => s.notes === 'V22_retry:country_out')).toBeDefined();
    expect(lastUserContent(generatorCalls()[1]!)).toContain('vive en UY');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(out.parts.join(' ')).not.toContain('videollamada');
  });

  it('el enlace con dos semanas de dolor y sin episodio anterior: reintento, y si insiste el turno se tumba', async () => {
    const { anthropic, generatorCalls, splitterCalls } = makeAnthropic([
      setterReply(`Aquí tienes el enlace: ${URL_REAL}`, 'active', 6, { lead_country_iso: 'ES', pain_duration_months: 0.5 }),
      setterReply(`Te lo dejo de nuevo: ${URL_REAL}`, 'active', 6, { lead_country_iso: 'ES', pain_duration_months: 0.5 }),
    ]);
    const run = runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    await expect(run).rejects.toBeInstanceOf(CallGateError);
    await expect(run).rejects.toThrow(/^V22: videollamada sin cualificar \(pain_recent/);
    expect(generatorCalls()).toHaveLength(2);
    expect(lastUserContent(generatorCalls()[1]!)).toContain('al menos 3 meses');
    expect(splitterCalls()).toBe(0);
  });

  it('dos semanas de dolor con un episodio anterior descrito: pasa', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, {
        lead_country_iso: 'ES',
        pain_duration_months: 0.5,
        previous_episode: true,
      }),
    ]);
    await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
  });

  it('sin saber desde cuándo le duele: el reintento lo pregunta', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'qualified', 5, { lead_country_iso: 'ES' }),
      setterReply(PREGUNTA_TIEMPO, 'active', 3, { lead_country_iso: 'ES' }),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.stages.find((s) => s.notes === 'V22_retry:pain_unknown')).toBeDefined();
    expect(lastUserContent(generatorCalls()[1]!)).toContain('no has declarado desde cuándo le duele');
    expect(out.parts.join(' ')).toContain('desde cuándo');
  });

  it('con el país confirmado por el prefijo basta con el dolor', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { pain_duration_months: 8 }),
    ]);
    await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, validationContext: { channel: 'whatsapp' }, callGate: { ...TANIA_GATE, countryKnownInZone: true } } as any,
    );
    expect(generatorCalls()).toHaveLength(1);
  });

  it('si el reintento falla por la red, el error sube tal cual (el motor reencola, no pausa)', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(PROPUESTA, 'active', 5, { pain_duration_months: 12 }),
      new Error('overloaded_error'),
    ]);
    const run = runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    await expect(run).rejects.toThrow('overloaded_error');
    await expect(run).rejects.not.toBeInstanceOf(CallGateError);
  });

  it('turnos de F1-F4 no pasan por el cerrojo aunque no declaren nada', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(PREGUNTA_TIEMPO, 'active', 3)]);
    await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
  });

  it('con la zona rechazada no actúa: de eso se ocupan V20 y V21', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply('En mi perfil tienes mucho contenido', 'disqualified', 4),
    ]);
    await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, validationContext: { channel: 'whatsapp', zoneRejected: true } } as any,
    );
    expect(generatorCalls()).toHaveLength(1);
  });
});
