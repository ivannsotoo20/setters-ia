import { describe, it, expect, vi } from 'vitest';
import { pickZoneCloseVariant, runPipeline } from '../src/pipeline.js';

/**
 * D1 (2026-10-21, Tania) — cierre de fuera de zona con el recurso que encaja.
 *
 * Tania: "cuando no cualifica se corta prácticamente de golpe; no se están
 * enviando los recursos que te compartí". Iván aprobó cerrar con el recurso, en
 * un único turno y sin enlace de agenda. El texto sigue siendo siempre de ella:
 * el modelo escribe el cierre que toca y el motor manda la variante cuya URL
 * aparece en él (`zone.closeVariants`); sin URL, o con otra, el cierre de siempre.
 */

const MOVILIDAD = 'https://www.youtube.com/watch?v=ug3D7LWf5Oo';
const FUERZA = 'https://youtu.be/A6m4vT1beZg';
const AGENDA = 'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const POR_DEFECTO = [
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda',
  'Cualquier duda que te surja, escríbeme, aquí me tienes',
];
const CIERRE_MOVILIDAD = [
  `Por lo que me cuentas, sobre todo esa rigidez al levantarte, te dejo una rutina cortita de movilidad para las mañanas que te puede venir muy bien para empezar: ${MOVILIDAD}`,
  'Cualquier duda que te surja, escríbeme, aquí me tienes 😊',
];
const CIERRE_FUERZA = [
  `Te comparto este enlace con un entreno de fuerza sin material, sencillo y seguro para tu espalda: ${FUERZA}`,
  'Cualquier duda que te surja, escríbeme, aquí me tienes 😊',
];
const VARIANTES = [CIERRE_MOVILIDAD, CIERRE_FUERZA];

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

function setterReply(messageRaw: string, status = 'disqualified', phase = 2) {
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

function makeAnthropic(generatorReplies: Array<ReturnType<typeof setterReply>>) {
  const gens = [...generatorReplies];
  const create = vi.fn(async (req: any) => {
    const toolName = req.tool_choice?.name;
    if (toolName === 'respond_as_setter') {
      const next = gens.shift();
      if (next === undefined) throw new Error('el test se quedó sin respuestas del Generator');
      return next;
    }
    throw new Error(`tool no simulada en el test: ${toolName}`);
  });
  return { anthropic: { messages: { create } } as any };
}

const baseInput = {
  tenantId: 7,
  conversationId: 14001,
  userMessage: 'Vivo en Lima, y lo peor es la rigidez al levantarme',
  currentPhase: 2,
  history: [
    { role: 'assistant' as const, content: 'Hola, por aquí Tânia 😊 qué te ocurre con la espalda?' },
    { role: 'user' as const, content: 'Me levanto muy rígida todas las mañanas' },
  ],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram', zoneRejected: true },
  zone: { mode: 'close', closeParts: POR_DEFECTO, closeVariants: VARIANTES },
};

describe('pickZoneCloseVariant', () => {
  it('elige la variante cuya URL lleva el texto del modelo, aunque vaya pegada a un signo', () => {
    expect(pickZoneCloseVariant(`te dejo esta rutina: ${MOVILIDAD}.`, VARIANTES)).toEqual(CIERRE_MOVILIDAD);
    expect(pickZoneCloseVariant(`mira esto ${FUERZA}`, VARIANTES)).toEqual(CIERRE_FUERZA);
  });

  it('sin URL, con la de la agenda o con otra cualquiera, ninguna: sale el cierre por defecto', () => {
    expect(pickZoneCloseVariant('En mi perfil tienes mucho contenido', VARIANTES)).toBeNull();
    expect(pickZoneCloseVariant(`reserva aquí ${AGENDA}`, VARIANTES)).toBeNull();
    expect(pickZoneCloseVariant('https://www.youtube.com/watch?v=otro', VARIANTES)).toBeNull();
  });

  it('sin variantes configuradas, ninguna', () => {
    expect(pickZoneCloseVariant(`te dejo esta rutina: ${MOVILIDAD}`, null)).toBeNull();
    expect(pickZoneCloseVariant(`te dejo esta rutina: ${MOVILIDAD}`, [])).toBeNull();
  });
});

describe('pipeline — cierre de fuera de zona con recurso (D1)', () => {
  it('si el modelo cierra con el vídeo de movilidad, sale esa variante tal cual', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(`Como eres de fuera, te paso esto que te vendrá bien: ${MOVILIDAD}`, 'disqualified'),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.parts).toEqual(CIERRE_MOVILIDAD);
    expect(out.parts.join(' ')).not.toContain('Como eres de fuera');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('si siguió cualificando pero con el vídeo de fuerza, sale la variante de fuerza y queda cerrada', async () => {
    const { anthropic } = makeAnthropic([setterReply(`Te comparto esto: ${FUERZA}. Y desde cuándo?`, 'active')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.parts).toEqual(CIERRE_FUERZA);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('sin vídeo, sale el cierre de siempre', async () => {
    const { anthropic } = makeAnthropic([setterReply('En mi perfil tienes mucho contenido', 'disqualified')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(POR_DEFECTO);
  });

  it('con el enlace de agenda, sale el cierre de siempre: nunca la agenda', async () => {
    const { anthropic } = makeAnthropic([setterReply(`Reserva aquí: ${AGENDA}`, 'qualified')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(POR_DEFECTO);
    expect(out.parts.join(' ')).not.toContain('leadconnectorhq');
  });

  it('si ya se le mandó una variante, no se repite ningún cierre', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(`Te paso también esta: ${FUERZA}`, 'active'),
    ]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      {
        ...baseInput,
        history: [...baseInput.history, { role: 'assistant' as const, content: CIERRE_MOVILIDAD[0]! }],
        userMessage: 'Gracias!',
      } as any,
    );
    expect(out.parts.join(' ')).not.toContain('youtu');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });
});
