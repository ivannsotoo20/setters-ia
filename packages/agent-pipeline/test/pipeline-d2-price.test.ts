import { describe, it, expect, vi } from 'vitest';
import { mentionsAllowedPrice, priceFigureLocked, runPipeline } from '../src/pipeline.js';

/**
 * D2 — la cifra del precio solo después de la primera frase (2026-10-21).
 *
 * Tania: el precio va en dos pasos; la primera vez, sin cifra. Con Elena (9 oct)
 * la IA dio la cifra a la primera. Con `priceGate` sin la primera frase dada,
 * V11 cuenta la cifra autorizada como filtración: un reintento pide la primera
 * frase tal cual, y si vuelve con cifra el turno se tumba, como cualquier otro
 * precio no autorizado.
 */

const CIFRA = 'entre 200 y 1.200 €';
const PRIMERA =
  'Claro, entiendo que el precio sea importante para ti. Pero antes creo que lo más importante es saber si realmente soy la persona adecuada para ayudarte.';
const CON_CIFRA = `Entiendo que quieras tener una referencia. Es un acompañamiento y según la modalidad está ${CIFRA}.`;
const SIN_CIFRA = `${PRIMERA} ¿Qué es lo que más te limita ahora mismo?`;

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

function setterReply(messageRaw: string) {
  return {
    id: 'msg_gen',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tu_gen',
        name: 'respond_as_setter',
        input: { message_raw: messageRaw, conversation_status: 'active', phase_decision: 3 },
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

function makeAnthropic(generatorReplies: Array<ReturnType<typeof setterReply> | Error>) {
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
  conversationId: 13900,
  userMessage: 'Antes de nada, ¿cuánto cuesta?',
  currentPhase: 3,
  history: [
    { role: 'assistant' as const, content: 'Hola, por aquí Tânia 😊 ¿en qué movimientos notas más molestias?' },
    { role: 'user' as const, content: 'Al agacharme' },
  ],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram' },
  allowedPriceText: CIFRA,
};

const LOCKED = { firstStepText: PRIMERA, firstStepDone: false };
const OPEN = { firstStepText: PRIMERA, firstStepDone: true };

describe('mentionsAllowedPrice', () => {
  it('reconoce la cifra escrita de varias formas', () => {
    expect(mentionsAllowedPrice(`está ${CIFRA}`, CIFRA)).toBe(true);
    expect(mentionsAllowedPrice('entre 200€ y 1200€', CIFRA)).toBe(true);
    expect(mentionsAllowedPrice('puede llegar a 1.200 euros', CIFRA)).toBe(true);
  });

  it('no salta sin sus números, ni con números cortos', () => {
    expect(mentionsAllowedPrice(PRIMERA, CIFRA)).toBe(false);
    expect(mentionsAllowedPrice('Llevo 3 años y 2 meses así', CIFRA)).toBe(false);
    expect(mentionsAllowedPrice('Cuesta 500 €', CIFRA)).toBe(false);
  });

  it('un precio autorizado sin números no bloquea nada', () => {
    expect(mentionsAllowedPrice('depende de la modalidad', 'depende de la modalidad')).toBe(false);
  });
});

describe('priceFigureLocked', () => {
  it('solo con precio autorizado y la primera frase sin dar', () => {
    expect(priceFigureLocked({ allowedPriceText: CIFRA, priceGate: LOCKED })).toBe(true);
    expect(priceFigureLocked({ allowedPriceText: CIFRA, priceGate: OPEN })).toBe(false);
    expect(priceFigureLocked({ allowedPriceText: CIFRA })).toBe(false);
    expect(priceFigureLocked({ allowedPriceText: null, priceGate: LOCKED })).toBe(false);
  });
});

describe('pipeline — D2 precio en dos pasos', () => {
  it('con la primera frase ya dada, la cifra autorizada sale sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(CON_CIFRA)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, priceGate: OPEN } as any,
    );
    expect(generatorCalls()).toHaveLength(1);
    expect(out.parts.join(' ')).toContain(CIFRA);
  });

  it('sin cerrojo configurado, todo como antes: la cifra autorizada sale', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(CON_CIFRA)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
    expect(out.parts.join(' ')).toContain(CIFRA);
  });

  it('si da la cifra a la primera, el reintento pide la primera frase y sale sin cifra', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(CON_CIFRA), setterReply(SIN_CIFRA)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, priceGate: LOCKED } as any,
    );
    expect(generatorCalls()).toHaveLength(2);
    expect(out.stages.find((s) => s.notes === 'V11_retry')).toBeDefined();
    expect(lastUserContent(generatorCalls()[1]!)).toContain(PRIMERA);
    const sent = out.parts.join(' ');
    expect(sent).not.toContain('1.200');
    expect(sent).toContain('la persona adecuada');
  });

  it('si el reintento vuelve con la cifra, sale solo la primera frase', async () => {
    const { anthropic } = makeAnthropic([setterReply(CON_CIFRA), setterReply(CON_CIFRA)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, priceGate: LOCKED } as any,
    );
    const sent = out.parts.join(' ');
    expect(sent).not.toContain('1.200');
    expect(sent.replace(/\s+/g, ' ')).toContain('lo más importante es saber si realmente soy la persona adecuada');
  });

  it('si el reintento lanza y la cifra sigue, sale solo la primera frase', async () => {
    const { anthropic } = makeAnthropic([setterReply(CON_CIFRA), new Error('overloaded')]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, priceGate: LOCKED } as any,
    );
    expect(out.parts.join(' ')).not.toContain('1.200');
  });

  it('un turno sin cifra no se reintenta aunque el cerrojo esté cerrado', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(SIN_CIFRA)]);
    await runPipeline({ supabase: makeFakeSupabase(), anthropic }, { ...baseInput, priceGate: LOCKED } as any);
    expect(generatorCalls()).toHaveLength(1);
  });
});
