import { describe, it, expect, vi } from 'vitest';
import { isZoneClose, runPipeline, ZoneCloseError } from '../src/pipeline.js';

/**
 * V21 — a una persona que no cualifica por residencia, el turno la CIERRA.
 *
 * Caso real (conv 12203, 2026-09-23): Instagram con teléfono +57 (Colombia). El
 * motor declaraba "no cualifica por residencia" y V20 impedía el enlace, pero el
 * modelo siguió cualificando 24 mensajes: la focal de fase le decía "FASE 1…" y
 * su razonamiento fue «se aplicará como cierre cuando corresponda; de momento
 * sigo el flujo». Iván: el cierre por zona NO puede depender de que el modelo lo
 * decida.
 *
 * Con `zoneRejected`, el output tiene que salir `disqualified`, o `handoff` con
 * B_derivacion (ella declaró residencia en zona). Si no: UN reintento pidiendo el
 * cierre; si tampoco, el turno se tumba con ZoneCloseError y no sale nada.
 */

const URL_REAL =
  'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

const CIERRE =
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda\n\nCualquier duda que te surja, escríbeme, aquí me tienes';

const SIGUE_CUALIFICANDO =
  'Qué bien que me escribas! Y cuéntame, desde cuándo te molesta la espalda?';

const DERIVA_A_TANIA = 'Genial, gracias por contármelo. Te escribe Tania en persona para confirmarlo contigo';

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
  status = 'active',
  phase = 1,
  handoffCause?: string,
) {
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
          conversation_status: status,
          phase_decision: phase,
          ...(handoffCause ? { handoff_cause: handoffCause } : {}),
        },
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
    // El Splitter cae a su troceado determinista si esto lanza; lo que importa
    // aquí es saber si llegó a ejecutarse.
    splitterCalls += 1;
    throw new Error(`tool no simulada en el test: ${toolName}`);
  });
  const generatorCalls = () =>
    create.mock.calls.filter((c: any[]) => c[0].tool_choice?.name === 'respond_as_setter');
  return {
    anthropic: { messages: { create } } as any,
    create,
    generatorCalls,
    splitterCalls: () => splitterCalls,
  };
}

function lastUserContent(call: any[]): string {
  const msgs = call[0].messages;
  return String(msgs[msgs.length - 1]?.content);
}

const baseInput = {
  tenantId: 7,
  conversationId: 12203,
  userMessage: 'Hola, vi tu vídeo de la espalda y me sentí muy identificada',
  currentPhase: 1,
  history: [],
  aiMessagesPerTurnMax: 3,
  validationContext: { channel: 'instagram', zoneRejected: true },
};

describe('isZoneClose', () => {
  it('cierra: disqualified, o handoff con B_derivacion o C_descualificado', () => {
    expect(isZoneClose({ conversation_status: 'disqualified' })).toBe(true);
    expect(isZoneClose({ conversation_status: 'handoff', handoff_cause: 'B_derivacion' })).toBe(true);
    // Handoff tras descualificación grave: también es un cierre (revisión 2026-09-26).
    expect(isZoneClose({ conversation_status: 'handoff', handoff_cause: 'C_descualificado' })).toBe(true);
  });

  it('no cierra: active, qualified, paused, o handoff A_agenda (darla por agendada)', () => {
    expect(isZoneClose({ conversation_status: 'active' })).toBe(false);
    expect(isZoneClose({ conversation_status: 'qualified' })).toBe(false);
    expect(isZoneClose({ conversation_status: 'paused' })).toBe(false);
    expect(isZoneClose({ conversation_status: 'handoff', handoff_cause: 'A_agenda' })).toBe(false);
  });

  it('cualquier otro handoff a la entrenadora cierra el turno (revisión del 26-09)', () => {
    // "Quiero hablar con Tania" (D_espera) o el apagado de una emergencia: la
    // persona queda con la entrenadora, no con el setter.
    expect(isZoneClose({ conversation_status: 'handoff' })).toBe(true);
    expect(isZoneClose({ conversation_status: 'handoff', handoff_cause: 'D_espera' })).toBe(true);
  });
});

describe('pipeline — V21 zona rechazada sin cierre', () => {
  it('status active → reintenta una vez y entrega el cierre disqualified del reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
      setterReply(CIERRE, 'disqualified', 1),
    ]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.stages.find((s) => s.notes === 'V21_retry')).toBeDefined();
    expect(generatorCalls()).toHaveLength(2);

    const retryPrompt = lastUserContent(generatorCalls()[1]!);
    expect(retryPrompt).toContain('NO cualifica por residencia');
    expect(retryPrompt).toContain('conversation_status="active"');
    expect(retryPrompt).toContain('conversation_status="disqualified"');
    expect(retryPrompt).toContain('B_derivacion');

    expect(out.parts.join(' ')).toContain('En mi perfil tienes mucho contenido');
    expect(out.parts.join(' ')).not.toContain('desde cuándo');
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
  });

  it('si el reintento tampoco cierra, tumba el turno con V21 y no llega al Splitter', async () => {
    const { anthropic, generatorCalls, splitterCalls } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
      setterReply('Entiendo! Y qué has probado hasta ahora para la espalda?', 'active', 2),
    ]);

    const run = runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    await expect(run).rejects.toBeInstanceOf(ZoneCloseError);
    await expect(run).rejects.toThrow(/^V21: zona rechazada sin cierre/);
    // Un solo reintento: el tercero no existe.
    expect(generatorCalls()).toHaveLength(2);
    expect(splitterCalls()).toBe(0);
  });

  it('si el reintento lanza, el turno se tumba con V21 (no sale la respuesta original)', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
      new Error('overloaded_error'),
    ]);

    await expect(
      runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any),
    ).rejects.toBeInstanceOf(ZoneCloseError);
  });

  it('handoff con B_derivacion (declaró residencia en zona) pasa sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(DERIVA_A_TANIA, 'handoff', 1, 'B_derivacion'),
    ]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(generatorCalls()).toHaveLength(1);
    expect(out.stages.find((s) => s.notes === 'V21_retry')).toBeUndefined();
    expect(out.generator.setterOutput.conversation_status).toBe('handoff');
    expect(out.generator.setterOutput.handoff_cause).toBe('B_derivacion');
    expect(out.parts.join(' ')).toContain('Te escribe Tania');
  });

  it('disqualified pasa sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(CIERRE, 'disqualified', 1)]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(generatorCalls()).toHaveLength(1);
    expect(out.parts.join(' ')).toContain('En mi perfil tienes mucho contenido');
  });

  it('handoff A_agenda con zona rechazada no cuenta como cierre: reintenta', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply('Perfecto, te dejo apuntada para el jueves', 'handoff', 6, 'A_agenda'),
      setterReply(CIERRE, 'disqualified', 1),
    ]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(generatorCalls()).toHaveLength(2);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(out.generator.setterOutput.handoff_cause).toBeUndefined();
  });

  it('handoff D_espera ("quiero hablar con Tania") pasa sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply('Claro, le digo a Tania que te escriba ella', 'handoff', 1, 'D_espera'),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);
    expect(generatorCalls()).toHaveLength(1);
    expect(out.generator.setterOutput.handoff_cause).toBe('D_espera');
  });

  it('URL + active: un único reintento para V20 y V21; si vuelve sin URL pero sin cerrar, V21', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(`Te dejo el enlace: ${URL_REAL}`, 'qualified', 6),
      setterReply('Vale, cuéntame un poco más de tu día a día?', 'active', 2),
    ]);

    const run = runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    await expect(run).rejects.toThrow(/^V21: zona rechazada sin cierre/);
    expect(generatorCalls()).toHaveLength(2);
    // La instrucción del reintento fue la de V20 (llevaba enlace) y ya pedía el cierre.
    const retryPrompt = lastUserContent(generatorCalls()[1]!);
    expect(retryPrompt).toContain('contiene un enlace');
    expect(retryPrompt).toContain('conversation_status="disqualified"');
  });

  it('si el reintento elige el apagado silencioso, no sale nada y no se tumba', async () => {
    const { anthropic, splitterCalls } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
      setterReply('', 'handoff', 1, 'C_descualificado'),
    ]);

    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, baseInput as any);

    expect(out.parts).toEqual([]);
    expect(out.generator.setterOutput.conversation_status).toBe('handoff');
    expect(splitterCalls()).toBe(0);
  });

  it('sin zoneRejected, V21 no aplica ni con zone.closeParts: un turno active sale con normalidad', async () => {
    const { anthropic } = makeAnthropic([setterReply(SIGUE_CUALIFICANDO, 'active', 1)]);
    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      {
        ...baseInput,
        validationContext: { channel: 'instagram' },
        zone: { mode: 'close', closeParts: LITERAL },
      } as any,
    );
    expect(out.parts.join(' ')).toContain('desde cuándo te molesta');
  });

  it('sin zoneRejected, V21 no aplica: un turno active sale con normalidad', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
    ]);

    const out = await runPipeline(
      { supabase: makeFakeSupabase(), anthropic },
      { ...baseInput, validationContext: { channel: 'instagram' } } as any,
    );

    expect(generatorCalls()).toHaveLength(1);
    expect(out.stages.find((s) => s.notes === 'V21_retry')).toBeUndefined();
    expect(out.parts.join(' ')).toContain('desde cuándo te molesta');
  });
});

// 2026-09-26 — el literal de la entrenadora sale tal cual. Batería de ese día:
// con la orden de copiarlo, el modelo le puso "Ahora mismo no puedo llevar tu
// caso directamente…" delante a un +57.
const LITERAL = [
  'En mi perfil tienes mucho contenido para ir avanzando con tu espalda',
  'Cualquier duda que te surja, escríbeme, aquí me tienes',
];
const CIERRE_CON_MOTIVO =
  'Gracias por escribir 😊 Ahora mismo no puedo llevar tu caso directamente, pero en mi perfil tienes contenido';

describe('pipeline — cierre por zona con el literal configurado (zone.closeParts)', () => {
  const closeInput = { ...baseInput, zone: { mode: 'close', closeParts: LITERAL } };

  it('disqualified con otro texto → sale el literal, burbuja a burbuja, sin Judge ni Splitter', async () => {
    const { anthropic, generatorCalls, splitterCalls, create } = makeAnthropic([
      setterReply(CIERRE_CON_MOTIVO, 'disqualified', 3),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);

    expect(out.parts).toEqual(LITERAL);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(out.generator.setterOutput.message_raw).not.toContain('no puedo llevar');
    expect(generatorCalls()).toHaveLength(1);
    expect(create.mock.calls.some((c: any[]) => c[0].tool_choice?.name === 'judge_message')).toBe(false);
    expect(splitterCalls()).toBe(0);
  });

  it('active (siguió cualificando) → sale el literal sin gastar el reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(SIGUE_CUALIFICANDO, 'active', 1)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);

    expect(out.parts).toEqual(LITERAL);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(generatorCalls()).toHaveLength(1);
  });

  it('con enlace → sale el literal, nunca el enlace', async () => {
    const { anthropic } = makeAnthropic([setterReply(`Te dejo el enlace: ${URL_REAL}`, 'qualified', 6)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);
    expect(out.parts).toEqual(LITERAL);
    expect(out.parts.join(' ')).not.toContain('http');
  });

  it('ALTA de la revisión: el apagado mudo de una emergencia NUNCA se sustituye por el literal', async () => {
    const { anthropic } = makeAnthropic([setterReply('', 'handoff', 1, 'D_espera')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);
    expect(out.parts).toEqual([]);
    expect(out.generator.setterOutput.conversation_status).toBe('handoff');
  });

  it('ningún handoff con mensaje se sustituye por el literal (D_espera, C_descualificado)', async () => {
    for (const cause of ['D_espera', 'C_descualificado']) {
      const { anthropic } = makeAnthropic([setterReply('Le digo a Tania que te escriba ella', 'handoff', 1, cause)]);
      const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);
      expect(out.parts.join(' '), cause).toContain('Tania');
      expect(out.parts.join(' '), cause).not.toContain('En mi perfil');
      expect(out.generator.setterOutput.handoff_cause).toBe(cause);
    }
  });

  it('literal ya enviado y el modelo sigue la conversación → no sale nada, estado cerrado, sin reintento', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply('Pues cuéntame, desde cuándo te duele?', 'active', 2),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, {
      ...closeInput,
      history: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: LITERAL[0] },
        { role: 'assistant', content: LITERAL[1] },
      ],
      userMessage: 'y por qué?',
    } as any);
    expect(out.parts).toEqual([]);
    expect(out.generator.setterOutput.conversation_status).toBe('disqualified');
    expect(generatorCalls()).toHaveLength(1);
  });

  it('la excepción (handoff B, dijo que vive en zona) la sigue decidiendo el modelo', async () => {
    const { anthropic } = makeAnthropic([setterReply(DERIVA_A_TANIA, 'handoff', 1, 'B_derivacion')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, closeInput as any);
    expect(out.generator.setterOutput.handoff_cause).toBe('B_derivacion');
    expect(out.parts.join(' ')).toContain('Te escribe Tania');
  });

  it('si el literal ya se le envió, no se repite: el modelo se despide (y V21 sigue vigilando)', async () => {
    const { anthropic } = makeAnthropic([setterReply('Un abrazo, que vaya muy bien', 'disqualified', 3)]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, {
      ...closeInput,
      history: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: LITERAL[0] },
        { role: 'assistant', content: LITERAL[1] },
      ],
      userMessage: 'y no me puedes ayudar aunque sea un poco?',
    } as any);
    expect(out.parts.join(' ')).toContain('Un abrazo');
    expect(out.parts.join(' ')).not.toContain('En mi perfil');
  });
});

describe('pipeline — zona en modo handoff (D1: formulario en zona, prefijo de fuera)', () => {
  const handoffInput = { ...baseInput, zone: { mode: 'handoff', closeParts: LITERAL } };

  it('handoff B pasa y NUNCA se sustituye por el literal de cierre', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([setterReply(DERIVA_A_TANIA, 'handoff', 1, 'B_derivacion')]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, handoffInput as any);
    expect(generatorCalls()).toHaveLength(1);
    expect(out.parts.join(' ')).toContain('Te escribe Tania');
    expect(out.parts.join(' ')).not.toContain('En mi perfil');
  });

  it('si el modelo la cierra (disqualified), reintenta pidiendo el paso a la entrenadora', async () => {
    const { anthropic, generatorCalls } = makeAnthropic([
      setterReply(LITERAL.join('\n\n'), 'disqualified', 1),
      setterReply(DERIVA_A_TANIA, 'handoff', 1, 'B_derivacion'),
    ]);
    const out = await runPipeline({ supabase: makeFakeSupabase(), anthropic }, handoffInput as any);
    expect(generatorCalls()).toHaveLength(2);
    expect(lastUserContent(generatorCalls()[1]!)).toContain('B_derivacion');
    expect(out.generator.setterOutput.handoff_cause).toBe('B_derivacion');
  });

  it('si tampoco tras el reintento, V21 tumba el turno (el motor pausa y avisa a la entrenadora)', async () => {
    const { anthropic } = makeAnthropic([
      setterReply(SIGUE_CUALIFICANDO, 'active', 1),
      setterReply(LITERAL.join('\n\n'), 'disqualified', 1),
    ]);
    await expect(
      runPipeline({ supabase: makeFakeSupabase(), anthropic }, handoffInput as any),
    ).rejects.toBeInstanceOf(ZoneCloseError);
  });
});
