import { describe, it, expect, vi } from 'vitest';
import { runPipeline, validateFreeZoneClose } from '../src/pipeline.js';

/**
 * D5 (2026-11-04, Iván) — cierre de fuera de zona en TEXTO LIBRE.
 *
 * Tania: "la lógica sí es la que quiero, pero no como guion fijo". El modelo
 * redacta el cierre con 1 o 2 vídeos sin CTA de su bloque; el motor solo valida
 * (vídeos permitidos por clave canónica, sin agenda, sin motivo, cierra) y, si
 * falla dos veces, cae a la variante literal de siempre (D1).
 */

const SENTADA = 'https://www.youtube.com/shorts/gb2Ts6AoLUc';
const LUMBAR = 'https://youtu.be/ORPWNlJQ1WE';
const LUMBAR_WATCH = 'https://www.youtube.com/watch?v=ORPWNlJQ1WE';
const MANANA = 'https://www.youtube.com/watch?v=ug3D7LWf5Oo';
const GRUPO_B = 'https://youtu.be/A6m4vT1beZg';
const AGENDA = 'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const POR_DEFECTO = [
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda',
  'Cualquier duda que te surja, escríbeme, aquí me tienes',
];
const CIERRE_LUMBAR = [
  `Por lo que me cuentas de la zona lumbar, tengo un vídeo con 10 ejercicios para la rigidez lumbar que creo que te puede venir bien para empezar. Te lo comparto: ${LUMBAR}`,
  'Pruébalo y cualquier duda que te surja me dices 😊',
];
const FREE = { allowedUrls: [SENTADA, LUMBAR, MANANA], maxUrls: 2 };
const LIBRE = `En ese caso tengo una pequeña secuencia que creo que te puede venir bien para esos momentos. Te la comparto: ${SENTADA}\n\nPruébala y cualquier duda que te surja me dices 😊`;

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

function setterReply(messageRaw: string, status = 'disqualified', phase = 3) {
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
  conversationId: 14003,
  userMessage: 'Sobre todo cuando paso muchas horas sentada en el trabajo',
  currentPhase: 2,
  history: [
    { role: 'user' as const, content: 'Hola, me duele la espalda' },
    { role: 'assistant' as const, content: 'Por cierto, desde dónde me escribes?' },
    { role: 'user' as const, content: 'Ecuador' },
    { role: 'assistant' as const, content: 'Y esa molestia la notas más en algún momento del día o haciendo algo concreto?' },
  ],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram', zoneRejected: true },
  composeOverrides: { trackedCalendarUrl: AGENDA },
  zone: {
    mode: 'close',
    closeParts: POR_DEFECTO,
    closeVariants: [CIERRE_LUMBAR],
    exploreTurnsLeft: 0,
    term: 'ecuador',
    rejectTerms: ['Ecuador', 'ecuatoriana', 'Quito', 'Colombia', 'colombiana', 'Bogotá'],
    freeClose: FREE,
  },
};
const TERMS = baseInput.zone.rejectTerms;

describe('validateFreeZoneClose', () => {
  const ok = { message_raw: LIBRE, conversation_status: 'disqualified' as const };

  it('un cierre con un vídeo permitido vale, en cualquiera de sus formas', () => {
    expect(validateFreeZoneClose(ok, FREE, 'ecuador', AGENDA)).toBeNull();
    expect(validateFreeZoneClose({ ...ok, message_raw: `Te lo comparto: ${LUMBAR_WATCH}` }, FREE, 'ecuador', AGENDA)).toBeNull();
    expect(
      validateFreeZoneClose({ ...ok, message_raw: `Dos que te pueden servir: ${SENTADA} y ${LUMBAR}` }, FREE, 'ecuador', AGENDA),
    ).toBeNull();
  });

  it('un vídeo que no está en la lista (el grupo B) no vale', () => {
    expect(validateFreeZoneClose({ ...ok, message_raw: `Te comparto ${GRUPO_B}` }, FREE, 'ecuador', AGENDA)).toBe('url_not_allowed');
  });

  it('más vídeos de los permitidos no vale', () => {
    expect(
      validateFreeZoneClose({ ...ok, message_raw: `${SENTADA} ${LUMBAR} ${MANANA}` }, FREE, 'ecuador', AGENDA),
    ).toBe('too_many_urls');
  });

  it('el enlace de agenda, el motivo y un turno que sigue preguntando no valen', () => {
    expect(validateFreeZoneClose({ ...ok, message_raw: `Reserva aquí ${AGENDA}` }, FREE, 'ecuador', AGENDA)).toBe('agenda_link');
    expect(
      validateFreeZoneClose({ ...ok, message_raw: `Como vives en Ecuador no puedo llevar tu caso: ${SENTADA}` }, FREE, 'ecuador', AGENDA),
    ).toBe('reveals_reason');
    expect(
      validateFreeZoneClose({ message_raw: 'Y desde cuándo lo notas?', conversation_status: 'active' }, FREE, 'ecuador', AGENDA),
    ).toBe('not_closed');
    expect(validateFreeZoneClose({ message_raw: '   ', conversation_status: 'disqualified' }, FREE, 'ecuador', AGENDA)).toBe('empty');
  });

  it('nombrar cualquier término de zona del tenant, o el motivo en otro idioma, tampoco vale', () => {
    // Caso real de la batería: a «I live in Bogotá» el modelo cerró con «clients based in Colombia».
    expect(
      validateFreeZoneClose(
        { ...ok, message_raw: `Right now I'm not able to take on clients based in Colombia, but here is a video: ${LUMBAR}` },
        FREE,
        'bogota',
        AGENDA,
        TERMS,
      ),
    ).toBe('reveals_reason');
    expect(
      validateFreeZoneClose({ ...ok, message_raw: `I won't be able to help you directly, but try this: ${LUMBAR}` }, FREE, 'bogota', AGENDA, TERMS),
    ).toBe('reveals_reason');
    expect(
      validateFreeZoneClose({ ...ok, message_raw: `Here is a short routine that may help with the lumbar stiffness: ${LUMBAR}` }, FREE, 'bogota', AGENDA, TERMS),
    ).toBeNull();
  });

  it('el cierre genérico sin vídeo vale si cierra', () => {
    expect(
      validateFreeZoneClose({ message_raw: POR_DEFECTO.join('\n\n'), conversation_status: 'disqualified' }, FREE, 'ecuador', AGENDA),
    ).toBeNull();
  });
});

describe('pipeline — cierre de fuera de zona en texto libre (D5)', () => {
  it('el cierre que redacta el modelo sale tal cual, cerrado, sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(LIBRE)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    const texto = out.parts.join('\n');
    expect(texto).toContain(SENTADA);
    expect(texto).toContain('Pruébala');
    expect(texto).not.toContain('En mi perfil');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(generatorCalls()).toHaveLength(1);
  });

  it('con un vídeo del grupo B hay un reintento y, si el reintento vale, sale el reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(`Te voy a compartir una secuencia para la rigidez: ${GRUPO_B}`),
      setterReply(LIBRE),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts.join('\n')).toContain(SENTADA);
    expect(out.parts.join('\n')).not.toContain(GRUPO_B);
    expect(generatorCalls()).toHaveLength(2);
    expect(String(generatorCalls()[1]![0].messages.at(-1)?.content)).toContain('no es uno de los vídeos sin CTA');
  });

  it('si falla dos veces, sale la variante literal del vídeo que eligió', async () => {
    const malo = `Como no trabajo con personas de Ecuador, te dejo esto: ${LUMBAR}`;
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(malo), setterReply(malo)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(CIERRE_LUMBAR);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(generatorCalls()).toHaveLength(2);
  });

  it('si falla dos veces sin ningún vídeo reconocible, sale el cierre por defecto', async () => {
    const { anthropic } = makeAnthropic([
      setterReply('Y desde cuándo lo notas?', 'active'),
      setterReply('Vale, y te duele más por la mañana?', 'active'),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(out.parts).toEqual(POR_DEFECTO);
  });

  it('con el cierre ya enviado (la conversación está cerrada) no se repite: si sigue hablando, no sale nada', async () => {
    const { anthropic } = makeAnthropic([setterReply('Y cómo te va con eso?', 'active')]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, zone: { ...baseInput.zone, closeSent: true } } as any,
    );
    expect(out.parts).toEqual([]);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('un vídeo permitido en un turno nuestro anterior cuenta como cierre enviado', async () => {
    const { anthropic } = makeAnthropic([setterReply('Gracias a ti, cuídate mucho', 'active')]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      {
        ...baseInput,
        history: [...baseInput.history, { role: 'assistant', content: `Te la comparto: ${LUMBAR_WATCH}` }],
      } as any,
    );
    expect(out.parts).toEqual([]);
  });

  it('sin freeClose (modo literal) nada cambia: un texto libre con un vídeo que no es variante sale como el cierre por defecto', async () => {
    const { anthropic } = makeAnthropic([setterReply(LIBRE)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, zone: { ...baseInput.zone, freeClose: undefined } } as any,
    );
    expect(out.parts).toEqual(POR_DEFECTO);
  });
});
