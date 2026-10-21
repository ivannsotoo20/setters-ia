import { describe, it, expect, vi } from 'vitest';
import { revealsZoneReason, runPipeline } from '../src/pipeline.js';

/**
 * Margen antes del cierre de zona (2026-10-21, Tania: "no quiero que salte
 * directamente; puede continuar un poco para entender lo que necesita").
 *
 * Con `zone.exploreTurnsLeft > 0` y el cierre sin enviar, un turno que pregunta
 * por lo suyo sale normal: sin el literal y sin V21. Todo lo demás (cerrar, un
 * enlace, un paso hacia la videollamada) sale como el cierre de la entrenadora.
 * Sin margen, el turno cierra como siempre.
 */

const MOVILIDAD = 'https://www.youtube.com/watch?v=ug3D7LWf5Oo';
const AGENDA = 'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const POR_DEFECTO = [
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda',
  'Cualquier duda que te surja, escríbeme, aquí me tienes',
];
const CIERRE_MOVILIDAD = [
  `Por lo que me cuentas, sobre todo esa rigidez al levantarte, te dejo una rutina cortita de movilidad para las mañanas que te puede venir muy bien para empezar: ${MOVILIDAD}`,
  'Cualquier duda que te surja, escríbeme, aquí me tienes 😊',
];

const PREGUNTA = 'Vaya, y qué es lo que más te molesta ahora mismo de la espalda?';

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

function setterReply(messageRaw: string, status = 'active', phase = 2) {
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
    { type: 'tool_use', id: 'tu_judge', name: 'judge_message', input: { decision: 'pass', violations: [] } },
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
    throw new Error(`tool no simulada en el test: ${toolName}`);
  });
  const generatorCalls = () =>
    create.mock.calls.filter((c: any[]) => c[0].tool_choice?.name === 'respond_as_setter');
  return { anthropic: { messages: { create } } as any, generatorCalls };
}

const baseInput = {
  tenantId: 7,
  conversationId: 14002,
  userMessage: 'De Perú',
  currentPhase: 2,
  history: [
    { role: 'user' as const, content: 'Me duele la espalda' },
    { role: 'assistant' as const, content: 'Por cierto, ¿desde dónde me escribes?' },
  ],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram', zoneRejected: true },
  composeOverrides: { trackedCalendarUrl: AGENDA },
  zone: { mode: 'close', closeParts: POR_DEFECTO, closeVariants: [CIERRE_MOVILIDAD], exploreTurnsLeft: 2 },
};

describe('pipeline — margen antes del cierre de zona', () => {
  it('una pregunta sobre lo suyo sale tal cual, sin cierre y sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(PREGUNTA)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.parts.join(' ')).toContain('qué es lo que más te molesta');
    expect(out.parts.join(' ')).not.toContain('En mi perfil');
    expect(out.generator.setterOutput.conversation_status).toBe('active');
    expect(generatorCalls()).toHaveLength(1);
  });

  it('si ya sabe qué le pasa y cierra con el vídeo, sale la variante tal cual', async () => {
    const { anthropic } = makeAnthropic([setterReply(`Te dejo esta rutina: ${MOVILIDAD}`, 'disqualified')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(CIERRE_MOVILIDAD);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('un enlace de agenda en el margen sale como el cierre de siempre', async () => {
    const { anthropic } = makeAnthropic([setterReply(`Si quieres, reserva aquí: ${AGENDA}`)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(POR_DEFECTO);
  });

  it('un paso hacia la videollamada, aunque no lleve enlace, sale como el cierre', async () => {
    const { anthropic } = makeAnthropic([
      setterReply('Lo mejor es que lo veamos en una videollamada, te parece?', 'active', 5),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(POR_DEFECTO);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('sin margen, la pregunta no sale: sale el cierre, como siempre', async () => {
    const { anthropic } = makeAnthropic([setterReply(PREGUNTA)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, zone: { ...baseInput.zone, exploreTurnsLeft: 0 } } as any,
    );
    expect(out.parts).toEqual(POR_DEFECTO);
  });

  it('con el cierre ya enviado, el margen no reabre la conversación', async () => {
    const { anthropic } = makeAnthropic([setterReply(PREGUNTA)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      {
        ...baseInput,
        history: [...baseInput.history, { role: 'user' as const, content: 'De Perú' }, { role: 'assistant' as const, content: CIERRE_MOVILIDAD[0]! }],
        userMessage: 'Gracias!',
      } as any,
    );
    expect(out.parts).toEqual([]);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });
});

describe('revealsZoneReason', () => {
  it('caza el país dicho, residir, "país" y "no trabajo con"', () => {
    expect(revealsZoneReason('Ahora mismo no trabajo con personas que residan en Colombia', 'colombia')).toBe(true);
    expect(revealsZoneReason('Como estás en Colombia, te cuento', 'Colombia')).toBe(true);
    expect(revealsZoneReason('Desde tu país es complicado', null)).toBe(true);
    expect(revealsZoneReason('Ahora mismo no llevo tu caso', null)).toBe(true);
  });

  it('no salta con una pregunta normal, la zona lumbar o el precio', () => {
    expect(revealsZoneReason(PREGUNTA, 'colombia')).toBe(false);
    expect(revealsZoneReason('Y en qué zona de la espalda lo notas más?', 'lima')).toBe(false);
    expect(revealsZoneReason('No trabajo por sesiones sueltas, es un acompañamiento', null)).toBe(false);
    expect(revealsZoneReason('Te limita mucho en el día a día?', 'lima')).toBe(false);
  });
});

describe('pipeline — el margen no deja ver el motivo', () => {
  const conTerm = { ...baseInput, zone: { ...baseInput.zone, term: 'colombia' } };

  it('si la pregunta nombra el motivo, se reescribe una vez y sale la reescrita', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply('Ahora mismo no trabajo con personas que residan en Colombia, pero cuéntame qué te pasa?'),
      setterReply(PREGUNTA),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, conTerm as any);
    expect(generatorCalls()).toHaveLength(2);
    expect(out.parts.join(' ')).toContain('qué es lo que más te molesta');
    expect(out.parts.join(' ')).not.toMatch(/Colombia|resid/i);
    expect(out.stages.some((s: any) => s.notes === 'zone_explore_retry')).toBe(true);
  });

  it('si vuelve a dejarlo ver, sale el cierre de la entrenadora', async () => {
    const { anthropic } = makeAnthropic([
      setterReply('No trabajo con personas de Colombia, qué te pasa?'),
      setterReply('Como resides fuera, dime qué te pasa'),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, conTerm as any);
    expect(out.parts).toEqual(POR_DEFECTO);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });
});
