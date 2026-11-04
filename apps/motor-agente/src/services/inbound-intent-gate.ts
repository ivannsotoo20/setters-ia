/**
 * Gate de intención en la apertura (2026-11-04, Tania — tenant 7).
 *
 * Qué resuelve. Con `ghl_inbound_mode` / `manychat_inbound_mode =
 * 'classified_only'`, un primer mensaje entrante sin palabra clave `inbound`
 * se guardaba y dejaba la IA pausada para siempre. Medido en producción desde
 * el 15-sep: 49 aperturas de Instagram de 4 o más palabras, 47 pausadas, 30 sin
 * respuesta de nadie. Tania quiere que la IA conteste a quien escribe con
 * interés real (cuenta su situación, pregunta por el programa, por cómo trabaja
 * o por el precio); que la palabra suelta («espalda», «hernia», «info») siga
 * por su flujo de ManyChat como hoy; y que quien abre preguntando si ella es
 * sanitaria, por su titulación, o presentándose como fisio o colega, NO reciba
 * respuesta automática (queda en pausa, visible para ella, con la etiqueta
 * «Profesional»). Decisión de Iván: la exclusión de profesionales aplica SOLO a
 * la apertura; a mitad de conversación el coach ya contesta «No soy
 * fisioterapeuta…».
 *
 * Tres modos (`tenant_configs.ghl_inbound_mode` y `manychat_inbound_mode`,
 * migración 084; default `classified_only`):
 *   - `all`: no se evalúa nada, la IA entra con cualquier mensaje (legacy).
 *   - `classified_only`: lo de siempre. Casa una palabra clave `inbound` →
 *     `conversation_source='inbound'` e IA activa; si no → pausa.
 *   - `classified_or_intent`: prefiltro sin coste y, solo si hace falta, un
 *     modelo barato (Haiku 4.5) con una tool forzada:
 *       keyword_inbound casa una palabra clave `inbound`, también suelta
 *                       («info», «espalda» a secas) → IA, como en
 *                       `classified_only`. Va ANTES que la palabra suelta por
 *                       decisión de Iván (4-nov). No hay doble respuesta: la
 *                       de ManyChat entra como `system` dentro del debounce y
 *                       la IA sigue cuando la persona contesta.
 *       keyword_flow    botón de una automatización o palabra suelta que NO
 *                       es palabra clave (isBareKeywordOpening) → pausa.
 *       needs_model     4 palabras o más → el modelo decide:
 *                         interest     → `inbound` + IA activa;
 *                         professional → pausa + etiqueta «Profesional» +
 *                                        `custom_fields.inbound_intent`;
 *                         other        → pausa.
 *       other           vacío (adjunto sin texto), saludo, 2-3 palabras → pausa.
 *
 * Coste y fallos. Antes de llamar al modelo se comprueba que el canal tiene una
 * `integration_accounts` activa (misma consulta que `process-debounced` paso 3):
 * sin ella (Facebook de Tania) la IA no podría contestar, así que no se gasta
 * nada → pausa. Modelo caído o respuesta sin sentido → pausa (fail-closed) y
 * `logger.warn`. Solo se evalúa cuando la conversación no tiene origen ni pausa
 * (es el primer mensaje). Cada decisión deja una línea `intent_gate` con
 * `{tenantId, conversationId, mode, outcome, latencyMs, model}`.
 *
 * NUNCA se guarda «profesional» en `conversation_source`: cualquier valor no
 * nulo ahí despierta a la IA si alguien reanuda desde el panel. La intención
 * va a `conversations.custom_fields.inbound_intent` y a la etiqueta.
 *
 * Registro en `llm_calls`: el enum `llm_role` no tiene valor para esto. Se usa
 * `role='qualifier'` con `request_payload.kind='inbound_intent_gate'` para
 * distinguirlo del cualificador de formularios (`kind='lead_qualifier'`). Añadir
 * un valor propio al enum es una migración de una línea (`ALTER TYPE
 * public.llm_role ADD VALUE 'intent_gate'`, fuera de transacción) más
 * regenerar tipos; queda propuesto, no decidido.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBareKeywordOpening, normalizeOpening } from '@fyzon/shared-validator';
import { logger } from '../lib/logger.js';
import {
  classifyInboundOnly,
  loadAutomationKeywords,
  type AutomationKeywordRow,
} from './automation-keywords.js';
import { applyLabelMotor } from './labels/apply-label.js';

// ============================================================================
// Modo
// ============================================================================

export type InboundGateMode = 'classified_only' | 'classified_or_intent' | 'all';

/**
 * Lee el valor crudo de `tenant_configs.{ghl,manychat}_inbound_mode`. Cualquier
 * cosa que no sea un modo conocido cae a `classified_only` (doctrina 2026-05-12).
 */
export function parseInboundGateMode(raw: unknown): InboundGateMode {
  if (raw === 'all' || raw === 'classified_or_intent') return raw;
  return 'classified_only';
}

// ============================================================================
// Prefiltro (puro, sin coste)
// ============================================================================

export type OpeningPrefilter = 'keyword_flow' | 'keyword_inbound' | 'needs_model' | 'other';

/** Desde aquí un mensaje es "suyo" y merece que lo lea el modelo. */
export const INTENT_MIN_WORDS = 4;

/**
 * Clasifica el primer mensaje sin gastar nada. El orden importa:
 *   1. casa una palabra clave de tipo `inbound`, también suelta → `keyword_inbound`;
 *   2. botón de una automatización o palabra suelta sin palabra clave → `keyword_flow`;
 *   3. 4 palabras o más → `needs_model`;
 *   4. lo demás (vacío, saludo, 2-3 palabras) → `other`.
 *
 * La palabra clave va antes que la palabra suelta por decisión de Iván (4-nov):
 * «info» a secas activa la IA igual que en `classified_only`. No hay doble
 * respuesta: la de ManyChat entra como `system` dentro del debounce y la IA
 * sigue cuando la persona contesta.
 */
export function prefilterOpening(
  text: string | null | undefined,
  keywords: AutomationKeywordRow[],
): OpeningPrefilter {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length === 0) return 'other';
  if (classifyInboundOnly(t, keywords) === 'inbound') return 'keyword_inbound';
  if (isBareKeywordOpening(t, keywords.map((k) => k.pattern))) return 'keyword_flow';
  const words = normalizeOpening(t).split(' ').filter((w) => w.length > 0);
  return words.length >= INTENT_MIN_WORDS ? 'needs_model' : 'other';
}

// ============================================================================
// Modelo
// ============================================================================

export type InboundIntent = 'interest' | 'professional' | 'other';

export const INBOUND_INTENT_MODEL = 'claude-haiku-4-5';
/** El primer mensaje rara vez pasa de aquí; lo que sobra no cambia la categoría. */
export const INBOUND_INTENT_MAX_CHARS = 600;
/** Haiku 4.5: $1/M entrada, $5/M salida, sin caché en esta llamada. */
const INTENT_PRICE_PER_M = { input: 1, output: 5 };

/**
 * El orden de las propiedades es el orden en que el modelo las escribe:
 * primero el motivo, después la categoría coherente con él (mismo patrón que
 * `qualify_lead` en lead-qualifier.ts, aprendido el 2026-09-26).
 */
const INTENT_TOOL = {
  name: 'classify_inbound_opening',
  description:
    'Clasifica el primer mensaje con el que una persona abre la conversación. Rellena los campos en ' +
    'orden: primero el motivo (reason), después la categoría (intent), coherente con el motivo.',
  input_schema: {
    type: 'object' as const,
    required: ['reason', 'intent'],
    properties: {
      reason: {
        type: 'string',
        description: 'Una frase en español: qué dice la persona y por qué encaja en la categoría.',
        maxLength: 300,
      },
      intent: {
        type: 'string',
        enum: ['interest', 'professional', 'other'],
        description: 'interest | professional | other (ver instrucciones).',
      },
    },
  },
};

const INTENT_SYSTEM_PROMPT = `Eres el filtro de apertura del asistente de una entrenadora (o entrenador) de salud y ejercicio que recibe mensajes directos en Instagram y Facebook. Recibes el PRIMER mensaje con el que una persona abre la conversación y decides a qué categoría pertenece. No respondes al mensaje.

Categorías:
- interest: la persona cuenta su dolor, su situación o lo que le pasa; pregunta por el programa, por cómo se trabaja, por el precio o por si se le puede ayudar. Es una posible clienta.
- professional: pregunta si quien atiende es sanitaria (fisioterapeuta, médica, enfermera…), por su titulación, formación o credenciales; se presenta como fisio, médico, entrenador, nutricionista o compañera de profesión; o propone una colaboración, un intercambio o venderle un servicio profesional.
- other: saludo sin contenido, spam, intento de venta ajeno a la profesión, otro tema que no tiene que ver, mensaje ininteligible.

Reglas:
- Ante la duda entre interest y cualquier otra categoría, elige interest.
- Mencionar a un profesional propio («mi fisio me dijo», «el médico me mandó reposo») NO es professional: es alguien contando su situación → interest.
- Preguntar «¿eres fisio?», «¿qué titulación tienes?» o «¿eres sanitaria?» SÍ es professional aunque además mencione un dolor.`;

export type IntentVerdict =
  | {
      kind: 'verdict';
      intent: InboundIntent;
      reason: string | null;
      usage: { input_tokens: number; output_tokens: number };
      latencyMs: number;
    }
  | { kind: 'error'; error: string; latencyMs: number };

function isInboundIntent(v: unknown): v is InboundIntent {
  return v === 'interest' || v === 'professional' || v === 'other';
}

/** Recorta por puntos de código, no por unidades UTF-16: no parte un emoji. */
function truncateForModel(text: string): string {
  return Array.from(text.trim()).slice(0, INBOUND_INTENT_MAX_CHARS).join('');
}

/**
 * Una llamada a Haiku 4.5 con la tool forzada. No lanza: cualquier fallo (red,
 * clave, respuesta sin `tool_use`, categoría desconocida) vuelve como
 * `{ kind: 'error' }` y el caller pausa.
 */
export async function classifyInboundIntent(input: {
  anthropic: Anthropic;
  text: string;
}): Promise<IntentVerdict> {
  const startedAt = Date.now();
  try {
    const response = await input.anthropic.messages.create({
      model: INBOUND_INTENT_MODEL,
      max_tokens: 300,
      system: INTENT_SYSTEM_PROMPT,
      tools: [INTENT_TOOL],
      tool_choice: { type: 'tool', name: INTENT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: `Primer mensaje de la persona (entre triple comilla):\n"""\n${truncateForModel(input.text)}\n"""`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; input: Record<string, unknown> }
      | undefined;
    const out = toolUse?.input ?? {};
    const latencyMs = Date.now() - startedAt;
    const usage = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    };
    if (!isInboundIntent(out.intent)) {
      return {
        kind: 'error',
        error: `respuesta sin categoría reconocida (${JSON.stringify(out.intent ?? null).slice(0, 40)})`,
        latencyMs,
      };
    }
    return {
      kind: 'verdict',
      intent: out.intent,
      reason: typeof out.reason === 'string' ? out.reason.trim().slice(0, 300) : null,
      usage,
      latencyMs,
    };
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

// ============================================================================
// Aplicar el gate (escrituras)
// ============================================================================

export const PROFESSIONAL_LABEL_NAME = 'Profesional';

export type InboundGateOutcome =
  /** IA activa */
  | 'keyword_inbound'
  | 'interest'
  /** pausa */
  | 'keyword_flow'
  | 'other'
  | 'unclassified'
  | 'professional'
  | 'skipped_no_integration'
  | 'model_error';

export type InboundGateDecidedBy = 'prefilter' | 'mode' | 'integration' | 'model';

export interface ApplyInboundIntentGateInput {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  /** Canal de la conversación: para comprobar la `integration_accounts` activa. */
  channelId: number;
  mode: InboundGateMode;
  /** Texto del primer mensaje (puede venir vacío: adjunto sin texto). */
  text: string | null | undefined;
  provider: 'ghl' | 'manychat';
  /** Cliente Anthropic perezoso: solo se construye si hay que llamar al modelo. */
  anthropic?: () => Promise<Anthropic>;
  /** Se llama cuando la conversación queda clasificada `inbound` (GHL: etiquetar el contacto). */
  onClassifiedInbound?: () => Promise<void>;
}

export interface ApplyInboundIntentGateResult {
  /** false: modo `all`, o no era el primer mensaje (ya tenía origen o pausa). No se tocó nada. */
  evaluated: boolean;
  /** Estado de la pausa al salir (si no se evaluó, el que ya tenía). */
  paused: boolean;
  outcome: InboundGateOutcome | null;
  decidedBy: InboundGateDecidedBy | null;
}

export async function applyInboundIntentGate(
  input: ApplyInboundIntentGateInput,
): Promise<ApplyInboundIntentGateResult> {
  const { supabase, tenantId, conversationId, channelId, mode, provider } = input;
  const startedAt = Date.now();

  if (mode === 'all') {
    return { evaluated: false, paused: false, outcome: null, decidedBy: null };
  }

  // Solo el primer mensaje: sin origen clasificado y sin pausa. Una conversación
  // ya pausada no se despausa aquí; una ya clasificada no se reclasifica.
  const { data: conv } = await supabase
    .from('conversations')
    .select('conversation_source, ai_paused_until')
    .eq('id', conversationId)
    .maybeSingle();
  const currentSource = (conv as { conversation_source?: unknown } | null)?.conversation_source ?? null;
  const alreadyPaused = Boolean((conv as { ai_paused_until?: unknown } | null)?.ai_paused_until);
  if (currentSource || alreadyPaused) {
    return { evaluated: false, paused: alreadyPaused, outcome: null, decidedBy: null };
  }

  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const keywords = text.length > 0 ? await loadAutomationKeywords(supabase, tenantId) : [];
  const prefilter = prefilterOpening(text, keywords);

  let outcome: InboundGateOutcome;
  let decidedBy: InboundGateDecidedBy;
  let model: string | null = null;
  let modelLatencyMs: number | null = null;

  if (prefilter === 'keyword_inbound') {
    // La palabra clave `inbound` manda en los dos modos clasificados, también
    // suelta (Pablo: «info» a secas; Iván 4-nov para `classified_or_intent`).
    await classifyAsInbound(input);
    outcome = 'keyword_inbound';
    decidedBy = 'prefilter';
  } else if (mode === 'classified_only') {
    // Lo de siempre: sin palabra clave, pausa.
    await pauseAi(supabase, tenantId, conversationId);
    outcome = prefilter === 'keyword_flow' ? 'keyword_flow' : prefilter === 'needs_model' ? 'unclassified' : 'other';
    decidedBy = prefilter === 'needs_model' ? 'mode' : 'prefilter';
  } else if (prefilter === 'keyword_flow' || prefilter === 'other') {
    await pauseAi(supabase, tenantId, conversationId);
    outcome = prefilter;
    decidedBy = 'prefilter';
  } else if (!(await hasActiveIntegration(supabase, tenantId, channelId))) {
    // Sin integración en el canal la IA no podría contestar: ni una llamada.
    await pauseAi(supabase, tenantId, conversationId);
    outcome = 'skipped_no_integration';
    decidedBy = 'integration';
  } else {
    model = INBOUND_INTENT_MODEL;
    const verdict = await runModel(input, text);
    modelLatencyMs = verdict.latencyMs;
    decidedBy = 'model';
    if (verdict.kind === 'error') {
      await pauseAi(supabase, tenantId, conversationId);
      outcome = 'model_error';
      logger.warn(
        { event: 'intent_gate', tenantId, conversationId, provider, mode, err: verdict.error },
        'intent_gate: el modelo no respondió; IA pausada (fail-closed)',
      );
    } else {
      outcome = verdict.intent;
      const record = {
        intent: verdict.intent,
        reason: verdict.reason,
        model: INBOUND_INTENT_MODEL,
        at: new Date().toISOString(),
      };
      if (verdict.intent === 'interest') {
        await classifyAsInbound(input);
      } else {
        // Pausa explícita primero: la etiqueta también pausa, pero si falta la
        // migración 083 o el INSERT falla, la IA no puede quedar viva.
        await pauseAi(supabase, tenantId, conversationId);
        if (verdict.intent === 'professional') {
          await applyProfessionalLabel(supabase, tenantId, conversationId);
        }
      }
      await persistInboundIntent(supabase, tenantId, conversationId, record);
    }
  }

  const paused = outcome !== 'keyword_inbound' && outcome !== 'interest';
  logger.info(
    {
      event: 'intent_gate',
      tenantId,
      conversationId,
      provider,
      mode,
      outcome,
      decidedBy,
      paused,
      latencyMs: Date.now() - startedAt,
      modelLatencyMs,
      model,
    },
    `intent_gate: ${outcome}`,
  );
  return { evaluated: true, paused, outcome, decidedBy };
}

// ----------------------------------------------------------------------------
// Escrituras
// ----------------------------------------------------------------------------

async function classifyAsInbound(input: ApplyInboundIntentGateInput): Promise<void> {
  const { supabase, tenantId, conversationId } = input;
  const { error } = await supabase
    .from('conversations')
    .update({ conversation_source: 'inbound', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (error) {
    logger.error(
      { tenantId, conversationId, err: error.message },
      'intent_gate: no se pudo clasificar la conversación como inbound',
    );
    return;
  }
  if (input.onClassifiedInbound) {
    try {
      await input.onClassifiedInbound();
    } catch (err) {
      logger.warn(
        { tenantId, conversationId, err: err instanceof Error ? err.message : String(err) },
        'intent_gate: onClassifiedInbound falló (no fatal)',
      );
    }
  }
}

async function pauseAi(supabase: SupabaseClient, tenantId: number, conversationId: number): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ ai_paused_until: 'infinity', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (error) {
    logger.error({ tenantId, conversationId, err: error.message }, 'intent_gate: no se pudo pausar la IA');
  }
}

/** Misma consulta que `process-debounced.ts` paso 3. Un error de BD cuenta como "no hay". */
async function hasActiveIntegration(
  supabase: SupabaseClient,
  tenantId: number,
  channelId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn(
      { tenantId, channelId, err: error.message },
      'intent_gate: no se pudo comprobar la integración del canal; se trata como ausente',
    );
    return false;
  }
  return Boolean(data);
}

async function runModel(input: ApplyInboundIntentGateInput, text: string): Promise<IntentVerdict> {
  const { supabase, tenantId, conversationId } = input;
  if (!input.anthropic) {
    return { kind: 'error', error: 'sin cliente Anthropic en el contexto', latencyMs: 0 };
  }
  let anthropic: Anthropic;
  try {
    anthropic = await input.anthropic();
  } catch (err) {
    return {
      kind: 'error',
      error: `no se pudo construir el cliente Anthropic: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: 0,
    };
  }
  const verdict = await classifyInboundIntent({ anthropic, text });
  await logIntentCall(supabase, { tenantId, conversationId, verdict });
  return verdict;
}

async function applyProfessionalLabel(
  supabase: SupabaseClient,
  tenantId: number,
  conversationId: number,
): Promise<boolean> {
  const { data: label, error } = await supabase
    .from('tenant_labels')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', PROFESSIONAL_LABEL_NAME)
    .maybeSingle();
  if (error || !label) {
    logger.warn(
      { tenantId, conversationId, err: error?.message ?? null },
      'intent_gate: el tenant no tiene la etiqueta «Profesional» (¿falta la migración 083?); la IA queda pausada igual',
    );
    return false;
  }
  try {
    await applyLabelMotor({
      supabase,
      tenantId,
      conversationId,
      labelId: Number((label as { id: number | string }).id),
      via: 'system_hook',
    });
    return true;
  } catch (err) {
    logger.warn(
      { tenantId, conversationId, err: err instanceof Error ? err.message : String(err) },
      'intent_gate: no se pudo aplicar la etiqueta «Profesional» (no fatal)',
    );
    return false;
  }
}

/**
 * Merge en `conversations.custom_fields.inbound_intent` (read-modify-write,
 * como `automation-lead-form.ts` con `form_answers`). Best-effort.
 */
async function persistInboundIntent(
  supabase: SupabaseClient,
  tenantId: number,
  conversationId: number,
  record: { intent: InboundIntent; reason: string | null; model: string; at: string },
): Promise<void> {
  try {
    const { data, error: readErr } = await supabase
      .from('conversations')
      .select('custom_fields')
      .eq('id', conversationId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const raw = (data as { custom_fields?: unknown } | null)?.custom_fields;
    const current =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const { error: writeErr } = await supabase
      .from('conversations')
      .update({ custom_fields: { ...current, inbound_intent: record } })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
    if (writeErr) throw new Error(writeErr.message);
  } catch (err) {
    logger.warn(
      { tenantId, conversationId, err: err instanceof Error ? err.message : String(err) },
      'intent_gate: no se pudo guardar custom_fields.inbound_intent (no fatal)',
    );
  }
}

/**
 * Registro best-effort en `llm_calls`. `role='qualifier'` porque el enum no
 * tiene valor propio (ver cabecera); `request_payload.kind` lo distingue.
 */
async function logIntentCall(
  supabase: SupabaseClient,
  p: { tenantId: number; conversationId: number; verdict: IntentVerdict },
): Promise<void> {
  const { verdict } = p;
  try {
    const usage = verdict.kind === 'verdict' ? verdict.usage : null;
    await supabase.from('llm_calls').insert({
      tenant_id: p.tenantId,
      conversation_id: p.conversationId,
      provider: 'anthropic',
      model: INBOUND_INTENT_MODEL,
      role: 'qualifier',
      status: verdict.kind === 'verdict' ? 'success' : 'error',
      tokens_in: usage?.input_tokens ?? null,
      tokens_out: usage?.output_tokens ?? null,
      cost: usage
        ? (usage.input_tokens * INTENT_PRICE_PER_M.input + usage.output_tokens * INTENT_PRICE_PER_M.output) /
          1_000_000
        : null,
      latency_ms: verdict.latencyMs,
      error_message: verdict.kind === 'error' ? verdict.error.slice(0, 500) : null,
      request_payload: { kind: 'inbound_intent_gate' },
      response_payload: verdict.kind === 'verdict' ? { intent: verdict.intent } : null,
    });
  } catch {
    // El log nunca tumba el gate.
  }
}
