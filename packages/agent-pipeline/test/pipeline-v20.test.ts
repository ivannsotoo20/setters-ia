import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

/**
 * V20 — ningún enlace a una persona que no cualifica por residencia.
 *
 * Caso real (tenant 7, 2026-09-11): un lead de WhatsApp con prefijo +502
 * (Guatemala, país al que la entrenadora no lleva) llegó a F6 y recibió el
 * enlace de agenda. Desde 2026-09-12 el motor enciende `zoneRejected` en el
 * contexto del validador y el orquestador reintenta una vez pidiendo el cierre
 * sin enlace; si el segundo intento vuelve con URL, el turno se tumba.
 */

const URL_REAL =
  'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const CIERRE =
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda\n\nCualquier duda que te surja, escríbeme, aquí me tienes';

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

function setterReply(messageRaw: string, status = 'active', phase = 6) {
  return {
    id: 'msg_gen',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tu_gen',
        name: 'respond_as_setter',
        input: { message_raw: messageRaw, conversation_status: status, phase_decision: phase },
      },
    ],
    usage: USAGE,
  };
}

const JUDGE_PASS = {
  id: 'msg_judge',
  stop_reason: 'tool_use',
  content: [
    {
      type: 'tool_use',
      id: 'tu_judge',
      name: 'judge_message',
      input: { decision: 'pass', violations: [] },
    },
  ],
  usage: USAGE,
};

function makeAnthropic(generatorReplies: Array<ReturnType<typeof setterReply>>) {
  const gens = [...generatorReplies];
  const create = vi.fn(async (req: any) => {
    const toolName = req.tool_choice?.name;
    if (toolName === 'respond_as_setter') {
      const next = gens.shift();
      if (next === undefined) throw new Error('el test se quedó sin respuestas del Generator');
      return next;
    }
    if (toolName === 'judge_message') return JUDGE_PASS;
    throw new Error(`tool inesperada en el test: ${toolName}`);
  });
  return { anthropic: { messages: { create } } as any, create };
}

const baseInput = {
  tenantId: 7,
  conversationId: 11660,
  userMessage: 'sí, me interesa la videollamada',
  currentPhase: 5,
  history: [],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'whatsapp', zoneRejected: true },
};

describe('pipeline — V20 enlace a persona fuera de zona', () => {
  it('reintenta una vez y entrega el cierre sin enlace, con el estado del reintento', async () => {
    const { anthropic, create } = makeAnthropic([
      setterReply(`Genial, pues te dejo por aquí el enlace:\n\n${URL_REAL}`, 'qualified', 6),
      setterReply(CIERRE, 'disqualified', 5),
    ]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    const retryStage = out.stages.find((s) => s.notes === 'V20_retry');
    expect(retryStage).toBeDefined();

    const retryCall = create.mock.calls.find(
      (c: any[]) =>
        c[0].tool_choice?.name === 'respond_as_setter' &&
        String(c[0].messages[c[0].messages.length - 1]?.content).includes('NO cualifica por residencia'),
    );
    expect(retryCall).toBeDefined();

    const entregado = out.parts.join(' ');
    expect(entregado).not.toContain('http');
    expect(entregado).toContain('En mi perfil tienes mucho contenido');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(out.generator.setterOutput.phase_decision).toBe(5);
    expect(out.validator.violations.find((v) => v.ruleId === 'V20')).toBeUndefined();
  });

  it('tumba el turno si el reintento vuelve con URL', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(`Te dejo el enlace: ${URL_REAL}`),
      setterReply(`Vale, aquí lo tienes de nuevo: ${URL_REAL}`),
    ]);

    await expect(
      runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any),
    ).rejects.toThrow(/V20/);
  });

  it('no reintenta cuando el turno no lleva enlace', async () => {
    const { anthropic } = makeAnthropic([setterReply(CIERRE, 'disqualified', 5)]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.stages.find((s) => s.notes === 'V20_retry')).toBeUndefined();
    expect(out.parts.join(' ')).toContain('En mi perfil tienes mucho contenido');
  });

  it('sin zoneRejected, la URL sale con normalidad (V20 no aplica)', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(`Te dejo el enlace para que agendes: ${URL_REAL}`),
    ]);

    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, currentPhase: 6, validationContext: { channel: 'whatsapp' } } as any,
    );

    expect(out.stages.find((s) => s.notes === 'V20_retry')).toBeUndefined();
    expect(out.parts.join(' ')).toContain(URL_REAL);
  });
});
