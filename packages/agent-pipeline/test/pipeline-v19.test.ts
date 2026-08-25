import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

/**
 * V19 — el turno no puede salir con el hueco del enlace sin rellenar.
 *
 * Caso real que lo motivó (batería del tenant 7, 2026-08-25): un lead que llevaba
 * cinco turnos exigiendo el enlace recibió "Aquí está el link para que revises:
 * [ENLACE]". Para la persona al otro lado eso es peor que no recibir nada.
 *
 * El orquestador reintenta UNA vez pidiendo la URL entera. Si el segundo intento
 * vuelve con el hueco, el turno se tumba: silencio + aviso al entrenador es malo,
 * mandar "[ENLACE]" es peor.
 */

const URL_REAL =
  'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

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
        input: {
          message_raw: messageRaw,
          conversation_status: 'active',
          phase_decision: 6,
        },
      },
    ],
    usage: USAGE,
  };
}

/**
 * El Judge aprueba tal cual: aquí lo que se prueba es el validador, no él.
 * Con `decision='pass'` el Judge devuelve el `messageRaw` que recibió, así que no
 * hace falta que el mock eche el texto de vuelta.
 */
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

/**
 * Encadena respuestas según el rol que pide cada llamada. El Generator y el Judge
 * comparten cliente, así que se distinguen por el nombre de la tool forzada.
 */
function makeAnthropic(generatorReplies: string[]) {
  const gens = [...generatorReplies];
  const create = vi.fn(async (req: any) => {
    const toolName = req.tool_choice?.name;
    if (toolName === 'respond_as_setter') {
      const next = gens.shift();
      if (next === undefined) throw new Error('el test se quedó sin respuestas del Generator');
      return setterReply(next);
    }
    if (toolName === 'judge_message') return JUDGE_PASS;
    throw new Error(`tool inesperada en el test: ${toolName}`);
  });
  return { anthropic: { messages: { create } } as any, create };
}

const baseInput = {
  tenantId: 7,
  conversationId: 42,
  userMessage: 'venga, pásame el enlace de una vez',
  currentPhase: 6,
  history: [],
  aiMessagesPerTurnMax: 3,
};

describe('pipeline — V19 marcador sin resolver', () => {
  it('reintenta una vez y entrega la URL real cuando el segundo intento la trae', async () => {
    const { anthropic, create } = makeAnthropic([
      'Aquí está el link para que revises: [ENLACE]',
      `Te dejo el enlace para que agendes cuando mejor te venga: ${URL_REAL}`,
    ]);

    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      baseInput as any,
    );

    // Se llamó al Generator dos veces (original + reintento).
    const retryStage = out.stages.find((s) => s.notes === 'V19_retry');
    expect(retryStage).toBeDefined();
    expect(retryStage?.role).toBe('generator');

    // El reintento pidió explícitamente la URL entera.
    const retryCall = create.mock.calls.find(
      (c: any[]) =>
        c[0].tool_choice?.name === 'respond_as_setter' &&
        String(c[0].messages[c[0].messages.length - 1]?.content).includes('marcador sin rellenar'),
    );
    expect(retryCall).toBeDefined();

    // Y lo que sale lleva la URL, no el hueco.
    const entregado = out.parts.join(' ');
    expect(entregado).toContain(URL_REAL);
    expect(entregado).not.toContain('[ENLACE]');
    expect(out.validator.violations.find((v) => v.ruleId === 'V19')).toBeUndefined();
  });

  it('tumba el turno si el reintento vuelve con el hueco', async () => {
    const { anthropic } = makeAnthropic([
      'Aquí está el link: [ENLACE]',
      'Te paso el [enlace] ahora mismo',
    ]);

    await expect(
      runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any),
    ).rejects.toThrow(/V19/);
  });

  it('no reintenta cuando el mensaje ya trae la URL de verdad', async () => {
    const { anthropic } = makeAnthropic([
      `Te dejo el enlace para que agendes: ${URL_REAL}`,
    ]);

    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      baseInput as any,
    );

    expect(out.stages.find((s) => s.notes === 'V19_retry')).toBeUndefined();
    expect(out.parts.join(' ')).toContain(URL_REAL);
  });
});
