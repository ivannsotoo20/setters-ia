import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INBOUND_INTENT_MODEL,
  applyInboundIntentGate,
  classifyInboundIntent,
  parseInboundGateMode,
  prefilterOpening,
  type ApplyInboundIntentGateInput,
} from '../src/services/inbound-intent-gate.js';
import type { AutomationKeywordRow } from '../src/services/automation-keywords.js';

/**
 * Gate de intención en la apertura (2026-11-04, Tania — tenant 7).
 *
 * Los textos son aperturas reales de Instagram del tenant 7. Las palabras
 * clave del fixture NO aparecen dentro de los mensajes largos a propósito: así
 * esos mensajes llegan al modelo y no se resuelven por `classifyInboundOnly`.
 */

const KEYWORDS: AutomationKeywordRow[] = [
  { type: 'inbound', pattern: 'info' },
  { type: 'inbound', pattern: 'espalda' },
  { type: 'inbound', pattern: 'cervical' },
  { type: 'bienvenida', pattern: 'Hola, te doy la bienvenida a esta comunidad 🎉' },
];

const INTEREST_1 = 'Tengo una hernia L5-S1 y quería saber cómo me puedes ayudar';
const INTEREST_2 = 'Hola! Cuánto cuesta tu programa?';
const PROFESSIONAL = 'Hola compañera, soy fisio, qué formación tienes?';

// ----------------------------------------------------------------------------
// Stub de Supabase: apunta cada llamada y responde por tabla.
// ----------------------------------------------------------------------------

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload?: unknown;
}

let calls: Call[] = [];
let conv: { conversation_source: string | null; ai_paused_until: string | null };
let integration: { id: number } | null;
let label: { id: number } | null;

function respond(call: Call): { data: unknown; error: null } {
  const ok = (data: unknown) => ({ data, error: null });
  switch (call.table) {
    case 'conversations':
      return ok(
        call.op === 'select'
          ? { ...conv, custom_fields: { form_answers: { Nombre: 'Ana' } }, assigned_user_id: null }
          : null,
      );
    case 'automation_keywords':
      return ok(KEYWORDS);
    case 'integration_accounts':
      return ok(integration);
    case 'tenant_labels':
      return ok(
        label
          ? { ...label, tenant_id: 7, pause_ai_on_apply: true, resume_ai_on_apply: false, auto_assign_to: null }
          : null,
      );
    case 'conversation_labels':
      return ok(null); // select: no estaba aplicada; insert: ok
    default:
      return ok(null);
  }
}

function makeSupabaseStub(): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, op: 'select' };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.insert = (p: unknown) => {
        call.op = 'insert';
        call.payload = p;
        return b;
      };
      b.update = (p: unknown) => {
        call.op = 'update';
        call.payload = p;
        return b;
      };
      for (const m of ['eq', 'neq', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
        b[m] = () => b;
      }
      b.then = (resolve: (v: unknown) => void) => {
        calls.push(call);
        resolve(respond(call));
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

function updates(table: string): Array<Record<string, unknown>> {
  return calls.filter((c) => c.table === table && c.op === 'update').map((c) => c.payload as Record<string, unknown>);
}
function inserts(table: string): Array<Record<string, unknown>> {
  return calls.filter((c) => c.table === table && c.op === 'insert').map((c) => c.payload as Record<string, unknown>);
}
function pausedWrites(): number {
  return updates('conversations').filter((p) => p.ai_paused_until === 'infinity').length;
}
function sourceWrites(): unknown[] {
  return updates('conversations').filter((p) => 'conversation_source' in p).map((p) => p.conversation_source);
}
function intentWrites(): Array<Record<string, unknown>> {
  return updates('conversations')
    .map((p) => (p.custom_fields as Record<string, unknown> | undefined)?.inbound_intent)
    .filter((v): v is Record<string, unknown> => Boolean(v));
}

// ----------------------------------------------------------------------------
// Mock de Anthropic
// ----------------------------------------------------------------------------

function makeAnthropic(intent: string | null, opts: { throws?: string } = {}) {
  const create = vi.fn(async () => {
    if (opts.throws) throw new Error(opts.throws);
    return {
      content: intent === null ? [] : [{ type: 'tool_use', input: { reason: 'motivo de prueba', intent } }],
      usage: { input_tokens: 520, output_tokens: 38 },
    };
  });
  return { anthropic: { messages: { create } } as unknown as Anthropic, create };
}

function gateInput(over: Partial<ApplyInboundIntentGateInput>): ApplyInboundIntentGateInput {
  return {
    supabase: makeSupabaseStub(),
    tenantId: 7,
    conversationId: 13886,
    channelId: 3,
    mode: 'classified_or_intent',
    text: INTEREST_1,
    provider: 'ghl',
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  conv = { conversation_source: null, ai_paused_until: null };
  integration = { id: 21 };
  label = { id: 42 };
});

// ============================================================================

describe('parseInboundGateMode', () => {
  it('reconoce los tres modos y cae a classified_only con cualquier otra cosa', () => {
    expect(parseInboundGateMode('all')).toBe('all');
    expect(parseInboundGateMode('classified_or_intent')).toBe('classified_or_intent');
    expect(parseInboundGateMode('classified_only')).toBe('classified_only');
    expect(parseInboundGateMode(null)).toBe('classified_only');
    expect(parseInboundGateMode('foo')).toBe('classified_only');
  });
});

describe('prefilterOpening', () => {
  it('el botón de una automatización y la palabra suelta que no es palabra clave son flujo de palabra clave', () => {
    for (const t of ['Siii😊', 'Get started', 'Si por favor', 'Empezar']) {
      expect(prefilterOpening(t, KEYWORDS), t).toBe('keyword_flow');
    }
  });

  it('la palabra clave inbound va antes que la palabra suelta: «info» a secas activa la IA (Iván, 4-nov)', () => {
    // «info» es palabra clave `inbound` del fixture y también botón: manda la palabra clave,
    // como en `classified_only`. La respuesta de ManyChat entra como `system` en el debounce.
    for (const t of ['Info', 'espalda', 'Espaldaa', 'Hola, espalda']) {
      expect(prefilterOpening(t, KEYWORDS), t).toBe('keyword_inbound');
    }
  });

  it('un mensaje suyo con una palabra clave inbound dentro se clasifica sin modelo', () => {
    expect(prefilterOpening('Hola! Cervical también?', KEYWORDS)).toBe('keyword_inbound');
    expect(prefilterOpening('Me duele mucho la espalda baja desde hace meses', KEYWORDS)).toBe('keyword_inbound');
  });

  it('un mensaje suyo de 4 palabras o más sin palabra clave necesita al modelo', () => {
    for (const t of [INTEREST_1, INTEREST_2, PROFESSIONAL, 'Hola, eres fisioterapeuta o entrenadora?']) {
      expect(prefilterOpening(t, KEYWORDS), t).toBe('needs_model');
    }
  });

  it('vacío (adjunto sin texto), saludo o 2-3 palabras: other', () => {
    for (const t of ['', '   ', null, undefined, 'Hola', 'Buenas tardes', '¿Eres sanitaria?', 'Hola Tania 😍']) {
      expect(prefilterOpening(t, KEYWORDS), String(t)).toBe('other');
    }
  });

  it('sin palabras clave configuradas sigue decidiendo por forma', () => {
    expect(prefilterOpening('Siii😊', [])).toBe('keyword_flow');
    expect(prefilterOpening('espalda', [])).toBe('other');
    expect(prefilterOpening(INTEREST_1, [])).toBe('needs_model');
  });
});

describe('classifyInboundIntent', () => {
  it('fuerza la tool, recorta a 600 caracteres y devuelve el veredicto', async () => {
    const { anthropic, create } = makeAnthropic('interest');
    const long = 'a'.repeat(900);
    const v = await classifyInboundIntent({ anthropic, text: long });
    expect(v.kind).toBe('verdict');
    if (v.kind === 'verdict') {
      expect(v.intent).toBe('interest');
      expect(v.reason).toBe('motivo de prueba');
      expect(v.usage).toEqual({ input_tokens: 520, output_tokens: 38 });
    }
    const req = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(req.model).toBe(INBOUND_INTENT_MODEL);
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'classify_inbound_opening' });
    const tool = (req.tools as Array<{ input_schema: { required: string[] } }>)[0]!;
    expect(tool.input_schema.required).toEqual(['reason', 'intent']);
    const user = (req.messages as Array<{ content: string }>)[0]!.content;
    expect(user).toContain('a'.repeat(600));
    expect(user).not.toContain('a'.repeat(601));
  });

  it('una categoría desconocida o una respuesta sin tool_use es error (el caller pausa)', async () => {
    expect((await classifyInboundIntent({ anthropic: makeAnthropic('maybe').anthropic, text: INTEREST_1 })).kind).toBe('error');
    expect((await classifyInboundIntent({ anthropic: makeAnthropic(null).anthropic, text: INTEREST_1 })).kind).toBe('error');
  });

  it('no lanza si la API falla', async () => {
    const v = await classifyInboundIntent({ anthropic: makeAnthropic('interest', { throws: 'ECONNRESET' }).anthropic, text: INTEREST_1 });
    expect(v.kind).toBe('error');
    if (v.kind === 'error') expect(v.error).toContain('ECONNRESET');
  });
});

describe('applyInboundIntentGate — classified_or_intent', () => {
  it('interés real: conversation_source=inbound, IA activa, etiqueta GHL, intención guardada y llm_calls', async () => {
    const { anthropic, create } = makeAnthropic('interest');
    const onClassifiedInbound = vi.fn(async () => undefined);
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic, onClassifiedInbound }));

    expect(r).toMatchObject({ evaluated: true, paused: false, outcome: 'interest', decidedBy: 'model' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(sourceWrites()).toEqual(['inbound']);
    expect(pausedWrites()).toBe(0);
    expect(onClassifiedInbound).toHaveBeenCalledTimes(1);
    expect(intentWrites()).toHaveLength(1);
    expect(intentWrites()[0]).toMatchObject({ intent: 'interest', reason: 'motivo de prueba', model: INBOUND_INTENT_MODEL });
    // El merge conserva lo que ya había en custom_fields.
    const cf = updates('conversations').find((p) => p.custom_fields)!.custom_fields as Record<string, unknown>;
    expect(cf.form_answers).toEqual({ Nombre: 'Ana' });

    const llm = inserts('llm_calls');
    expect(llm).toHaveLength(1);
    expect(llm[0]).toMatchObject({
      tenant_id: 7,
      conversation_id: 13886,
      role: 'qualifier',
      model: INBOUND_INTENT_MODEL,
      status: 'success',
      tokens_in: 520,
      tokens_out: 38,
      request_payload: { kind: 'inbound_intent_gate' },
      response_payload: { intent: 'interest' },
    });
    expect(llm[0]!.cost).toBeCloseTo((520 * 1 + 38 * 5) / 1_000_000, 9);
  });

  it('«Hola! Cuánto cuesta tu programa?» también llega al modelo y entra como interés', async () => {
    const { anthropic, create } = makeAnthropic('interest');
    const r = await applyInboundIntentGate(gateInput({ text: INTEREST_2, anthropic: async () => anthropic }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.outcome).toBe('interest');
    expect(r.paused).toBe(false);
  });

  it('profesional: pausa, etiqueta «Profesional» por system_hook, intención guardada y NUNCA conversation_source', async () => {
    const { anthropic } = makeAnthropic('professional');
    const onClassifiedInbound = vi.fn(async () => undefined);
    const r = await applyInboundIntentGate(
      gateInput({ text: PROFESSIONAL, anthropic: async () => anthropic, onClassifiedInbound }),
    );

    expect(r).toMatchObject({ evaluated: true, paused: true, outcome: 'professional', decidedBy: 'model' });
    expect(pausedWrites()).toBeGreaterThanOrEqual(1);
    expect(sourceWrites()).toEqual([]);
    expect(onClassifiedInbound).not.toHaveBeenCalled();
    expect(inserts('conversation_labels')).toEqual([
      expect.objectContaining({ conversation_id: 13886, label_id: 42, tenant_id: 7, applied_via: 'system_hook' }),
    ]);
    expect(intentWrites()[0]).toMatchObject({ intent: 'professional' });
    expect(inserts('llm_calls')[0]).toMatchObject({ response_payload: { intent: 'professional' } });
  });

  it('profesional sin la etiqueta en el tenant (falta la migración 083): la IA queda pausada igual', async () => {
    label = null;
    const { anthropic } = makeAnthropic('professional');
    const r = await applyInboundIntentGate(gateInput({ text: PROFESSIONAL, anthropic: async () => anthropic }));
    expect(r.paused).toBe(true);
    expect(pausedWrites()).toBe(1);
    expect(inserts('conversation_labels')).toEqual([]);
  });

  it('other según el modelo: pausa sin etiqueta', async () => {
    const { anthropic } = makeAnthropic('other');
    const r = await applyInboundIntentGate(gateInput({ text: 'Hola guapa, te sigo desde hace tiempo', anthropic: async () => anthropic }));
    expect(r).toMatchObject({ paused: true, outcome: 'other', decidedBy: 'model' });
    expect(pausedWrites()).toBe(1);
    expect(inserts('conversation_labels')).toEqual([]);
    expect(intentWrites()[0]).toMatchObject({ intent: 'other' });
  });

  it('botón de una automatización («Siii😊», «Get started»): pausa, ManyChat sigue, cero llamadas al modelo', async () => {
    for (const t of ['Siii😊', 'Get started']) {
      calls = [];
      const { anthropic, create } = makeAnthropic('interest');
      const r = await applyInboundIntentGate(gateInput({ text: t, anthropic: async () => anthropic }));
      expect(r, t).toMatchObject({ evaluated: true, paused: true, outcome: 'keyword_flow', decidedBy: 'prefilter' });
      expect(create, t).not.toHaveBeenCalled();
      expect(pausedWrites(), t).toBe(1);
      expect(inserts('llm_calls'), t).toEqual([]);
    }
  });

  it('palabra clave inbound suelta («espalda», «Info»): inbound sin pausa y cero llamadas al modelo (Iván, 4-nov)', async () => {
    for (const t of ['espalda', 'Info']) {
      calls = [];
      const { anthropic, create } = makeAnthropic('other');
      const onClassifiedInbound = vi.fn(async () => undefined);
      const r = await applyInboundIntentGate(gateInput({ text: t, anthropic: async () => anthropic, onClassifiedInbound }));
      expect(r, t).toMatchObject({ evaluated: true, paused: false, outcome: 'keyword_inbound', decidedBy: 'prefilter' });
      expect(create, t).not.toHaveBeenCalled();
      expect(pausedWrites(), t).toBe(0);
      expect(sourceWrites(), t).toEqual(['inbound']);
      expect(onClassifiedInbound, t).toHaveBeenCalledTimes(1);
      expect(inserts('llm_calls'), t).toEqual([]);
    }
  });

  it('palabra clave inbound dentro de un mensaje suyo: inbound sin modelo (como hoy)', async () => {
    const { anthropic, create } = makeAnthropic('other');
    const onClassifiedInbound = vi.fn(async () => undefined);
    const r = await applyInboundIntentGate(
      gateInput({ text: 'Hola! Cervical también?', anthropic: async () => anthropic, onClassifiedInbound }),
    );
    expect(r).toMatchObject({ paused: false, outcome: 'keyword_inbound', decidedBy: 'prefilter' });
    expect(create).not.toHaveBeenCalled();
    expect(sourceWrites()).toEqual(['inbound']);
    expect(onClassifiedInbound).toHaveBeenCalledTimes(1);
  });

  it('adjunto sin texto: other por prefiltro, pausa, sin leer palabras clave ni llamar al modelo', async () => {
    const { anthropic, create } = makeAnthropic('interest');
    const r = await applyInboundIntentGate(gateInput({ text: '', anthropic: async () => anthropic }));
    expect(r).toMatchObject({ paused: true, outcome: 'other', decidedBy: 'prefilter' });
    expect(create).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'automation_keywords')).toBe(false);
  });

  it('sin integration_accounts activa en el canal (Facebook): pausa y cero llamadas al modelo', async () => {
    integration = null;
    const { anthropic, create } = makeAnthropic('interest');
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic }));
    expect(r).toMatchObject({ paused: true, outcome: 'skipped_no_integration', decidedBy: 'integration' });
    expect(create).not.toHaveBeenCalled();
    expect(pausedWrites()).toBe(1);
    expect(inserts('llm_calls')).toEqual([]);
  });

  it('modelo caído: pausa (fail-closed) y llm_calls con status error', async () => {
    const { anthropic } = makeAnthropic('interest', { throws: 'overloaded_error' });
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic }));
    expect(r).toMatchObject({ paused: true, outcome: 'model_error', decidedBy: 'model' });
    expect(pausedWrites()).toBe(1);
    expect(sourceWrites()).toEqual([]);
    expect(inserts('llm_calls')[0]).toMatchObject({ status: 'error', error_message: 'overloaded_error' });
  });

  it('respuesta del modelo sin categoría reconocida: pausa', async () => {
    const { anthropic } = makeAnthropic('maybe');
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic }));
    expect(r).toMatchObject({ paused: true, outcome: 'model_error' });
  });

  it('sin cliente Anthropic en el contexto: pausa, no revienta', async () => {
    const r = await applyInboundIntentGate(gateInput({ anthropic: undefined }));
    expect(r).toMatchObject({ paused: true, outcome: 'model_error' });
    expect(pausedWrites()).toBe(1);
  });

  it('no es el primer mensaje (ya tiene origen): no se evalúa ni se escribe nada', async () => {
    conv = { conversation_source: 'lm', ai_paused_until: null };
    const { anthropic, create } = makeAnthropic('other');
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic }));
    expect(r).toEqual({ evaluated: false, paused: false, outcome: null, decidedBy: null });
    expect(create).not.toHaveBeenCalled();
    expect(updates('conversations')).toEqual([]);
  });

  it('ya pausada: no se despausa ni se reclasifica', async () => {
    conv = { conversation_source: null, ai_paused_until: 'infinity' };
    const { anthropic, create } = makeAnthropic('interest');
    const r = await applyInboundIntentGate(gateInput({ anthropic: async () => anthropic }));
    expect(r).toEqual({ evaluated: false, paused: true, outcome: null, decidedBy: null });
    expect(create).not.toHaveBeenCalled();
    expect(updates('conversations')).toEqual([]);
  });
});

describe('applyInboundIntentGate — classified_only y all (comportamiento de siempre)', () => {
  it('all: no toca la BD', async () => {
    const r = await applyInboundIntentGate(gateInput({ mode: 'all' }));
    expect(r).toEqual({ evaluated: false, paused: false, outcome: null, decidedBy: null });
    expect(calls).toEqual([]);
  });

  it('classified_only: un mensaje de 4+ palabras sin palabra clave se pausa sin modelo', async () => {
    const { anthropic, create } = makeAnthropic('interest');
    const r = await applyInboundIntentGate(gateInput({ mode: 'classified_only', anthropic: async () => anthropic }));
    expect(r).toMatchObject({ evaluated: true, paused: true, outcome: 'unclassified', decidedBy: 'mode' });
    expect(create).not.toHaveBeenCalled();
    expect(pausedWrites()).toBe(1);
  });

  it('classified_only: la palabra clave inbound suelta sigue activando la IA (Pablo: «info»)', async () => {
    const onClassifiedInbound = vi.fn(async () => undefined);
    const r = await applyInboundIntentGate(gateInput({ mode: 'classified_only', text: 'Info', onClassifiedInbound }));
    expect(r).toMatchObject({ paused: false, outcome: 'keyword_inbound' });
    expect(sourceWrites()).toEqual(['inbound']);
    expect(onClassifiedInbound).toHaveBeenCalledTimes(1);
  });

  it('classified_only: botón sin palabra clave se pausa', async () => {
    const r = await applyInboundIntentGate(gateInput({ mode: 'classified_only', text: 'Siii😊' }));
    expect(r).toMatchObject({ paused: true, outcome: 'keyword_flow' });
    expect(pausedWrites()).toBe(1);
  });
});
