import { describe, it, expect, vi } from 'vitest';
import { asksForCountry, countryAskMiss, runPipeline } from '../src/pipeline.js';
import type { CallGate } from '../src/types.js';

/**
 * V23 — país a tiempo (2026-10-20).
 *
 * Tania: "el país se está preguntando demasiado tarde". Medido ese día, 1 de 44
 * conversaciones de Instagram lo preguntó en los dos primeros mensajes de la IA
 * y 15 no lo preguntaron nunca. Con `countryAsk` (el motor decide que toca), un
 * turno que ni pregunta el país ni lo declara tiene UN reintento. A diferencia de
 * V22, nunca tumba el turno: preguntarlo tarde es mejor que pausar.
 */

const PREGUNTA_TANIA =
  'Por cierto, de dónde me escribes? Te pregunto porque acompaño a personas de distintos países';
const ACUSE_SIN_PAIS =
  'Con fisio y medicación aliviando un tiempo pero el dolor volviendo, tiene sentido que quieras ir más al fondo. Y en tu día a día, qué es lo que más te limita ahora mismo?';
const ACUSE_CON_PAIS = `Con fisio y medicación aliviando un tiempo pero el dolor volviendo, tiene sentido que quieras ir más al fondo. ${PREGUNTA_TANIA}`;

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
  const create = vi.fn(async (req: any) => {
    const toolName = req.tool_choice?.name;
    if (toolName === 'respond_as_setter') {
      const next = gens.shift();
      if (next === undefined) throw new Error('el test se quedó sin respuestas del Generator');
      if (next instanceof Error) throw next;
      return next;
    }
    if (toolName === 'judge_message') return JUDGE_PASS;
    throw new Error(`tool no simulada en el test: ${toolName}`);
  });
  const generatorCalls = () =>
    create.mock.calls.filter((c: any[]) => c[0].tool_choice?.name === 'respond_as_setter');
  return { anthropic: { messages: { create } } as any, generatorCalls };
}

function lastUserContent(call: any[]): string {
  const msgs = call[0].messages;
  return String(msgs[msgs.length - 1]?.content);
}

const baseInput = {
  tenantId: 7,
  conversationId: 13744,
  userMessage: 'He hecho fisio y medicación, me alivia un tiempo pero vuelve. Estoy buscando información para poder solucionar',
  currentPhase: 2,
  history: [
    { role: 'assistant' as const, content: 'Hola, por aquí Tânia 😊 ¿en qué movimientos notas más molestias?' },
    { role: 'user' as const, content: 'Al agacharme y al estar mucho rato de pie' },
    { role: 'assistant' as const, content: 'Vaya, se nota que te limita bastante. Y esto desde cuándo lo notas así??' },
  ],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram' },
  callGate: TANIA_GATE,
  countryAsk: { turn: 2, question: PREGUNTA_TANIA },
};

describe('asksForCountry', () => {
  it('reconoce las formas de preguntar desde dónde escribe, con y sin tilde', () => {
    expect(asksForCountry(PREGUNTA_TANIA)).toBe(true);
    expect(asksForCountry('Por cierto, ¿desde dónde me escribes?')).toBe(true);
    expect(asksForCountry('y tu desde donde me escribes?')).toBe(true);
    expect(asksForCountry('¿Dónde vives ahora mismo?')).toBe(true);
    expect(asksForCountry('¿En qué país vives?')).toBe(true);
    expect(asksForCountry('¿De qué país eres?')).toBe(true);
  });

  it('no confunde con otras preguntas que llevan "desde" o "dónde"', () => {
    expect(asksForCountry('En la videollamada valoramos desde dónde partes')).toBe(false);
    expect(asksForCountry('¿Desde cuándo te pasa?')).toBe(false);
    expect(asksForCountry('¿Dónde te duele más?')).toBe(false);
    expect(asksForCountry('Cuéntame un poco más')).toBe(false);
  });
});

describe('countryAskMiss', () => {
  it('falla si el turno sigue la conversación sin preguntarlo ni declararlo', () => {
    expect(countryAskMiss({ conversation_status: 'active' }, ACUSE_SIN_PAIS)).toBe(true);
  });

  it('no falla si lo pregunta, si ya lo declara, o si el turno no sigue la conversación', () => {
    expect(countryAskMiss({ conversation_status: 'active' }, ACUSE_CON_PAIS)).toBe(false);
    expect(countryAskMiss({ conversation_status: 'active', lead_country_iso: 'ES' }, ACUSE_SIN_PAIS)).toBe(false);
    expect(countryAskMiss({ conversation_status: 'disqualified' }, ACUSE_SIN_PAIS)).toBe(false);
    expect(countryAskMiss({ conversation_status: 'handoff' }, ACUSE_SIN_PAIS)).toBe(false);
    expect(countryAskMiss({ conversation_status: 'paused' }, ACUSE_SIN_PAIS)).toBe(false);
    expect(countryAskMiss({ conversation_status: 'active' }, '   ')).toBe(false);
  });
});

describe('pipeline — V23 país a tiempo', () => {
  it('si el turno ya pregunta el país, sale sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(ACUSE_CON_PAIS, 'active', 2)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
    expect(out.stages.find((s) => s.notes === 'V23_retry')).toBeUndefined();
    expect(out.parts.join(' ')).toContain('de dónde me escribes');
  });

  it('si no lo pregunta, el reintento lo pide con su frase y eso es lo que sale', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(ACUSE_SIN_PAIS, 'active', 2),
      setterReply(ACUSE_CON_PAIS, 'active', 2),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(2);
    expect(out.stages.find((s) => s.notes === 'V23_retry')).toBeDefined();
    const retryPrompt = lastUserContent(generatorCalls()[1]!);
    expect(retryPrompt).toContain('turno 2');
    expect(retryPrompt).toContain(PREGUNTA_TANIA);
    expect(retryPrompt).toContain('lead_country_iso');
    expect(out.parts.join(' ')).toContain('de dónde me escribes');
  });

  it('si el reintento tampoco lo pregunta, el turno sale igual: no se tumba', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(ACUSE_SIN_PAIS, 'active', 2),
      setterReply(`${ACUSE_SIN_PAIS} Cuéntame.`, 'active', 2),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(2);
    expect(out.parts.join(' ')).toContain('Cuéntame.');
  });

  it('si el reintento lanza, sale la respuesta original', async () => {
    const { anthropic } = makeAnthropic([setterReply(ACUSE_SIN_PAIS, 'active', 2), new Error('overloaded')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts.join(' ')).toContain('qué es lo que más te limita');
  });

  it('si ya declara el país, no hay reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(ACUSE_SIN_PAIS, 'active', 2, { lead_country_iso: 'ES' }),
    ]);
    await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
  });

  it('sin countryAsk (WhatsApp, turno 1, ya preguntado) no se mira', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(ACUSE_SIN_PAIS, 'active', 2)]);
    await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, countryAsk: undefined } as any,
    );
    expect(generatorCalls()).toHaveLength(1);
  });
});
