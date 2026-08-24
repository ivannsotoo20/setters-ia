import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateCostUsd } from './cost.js';
import { logLlmCall } from './llm-call-log.js';
import type { AnthropicTool, GeneratorUsage } from './types.js';

export const DEFAULT_JUDGE_MODEL = 'claude-haiku-4-5';
export const JUDGE_TOOL_NAME = 'judge_message';
const JUDGE_MAX_TOKENS = 800;
/** TTL del cache_control aplicado al system prompt del Judge. Alineado con el composer (1h). */
const JUDGE_CACHE_TTL: '1h' = '1h';

export interface JudgeInput {
  /** Texto del setter post-Generator. */
  messageRaw: string;
  /** Fase actual para guardar contexto al modelo. */
  currentPhase: number;
  /** Resumen breve del coach para que el Judge sepa qué reglas aplicar. */
  coachSummary?: string;
  /** Contexto bruto adicional (último mensaje del lead, datos del subscriber). */
  conversationContext?: string;
  tenantId: number;
  conversationId: number | null;
  model?: string;
}

export interface JudgeOutput {
  /** Decisión final tomada por el Judge. */
  decision: 'pass' | 'fix' | 'reject';
  /** Si decision='fix', el texto reescrito. Si 'pass', es identico al input. */
  finalText: string;
  /** Lista de violaciones encontradas por el Judge (puede estar vacía). */
  violations: string[];
  reasoning?: string;
  usage: GeneratorUsage;
  llmCallId?: number;
}

/**
 * Tool definition forzada del Judge.
 * - decision: pass / fix / reject
 * - fixed_text: si fix, el texto corregido (obligatorio)
 * - violations: razones humanas-readable
 */
export const judgeMessageTool: AnthropicTool = {
  name: JUDGE_TOOL_NAME,
  description:
    'Evalúa el mensaje del setter contra los guardrails del coach (no IA, no precios antes de F5, no saludos repetidos, ' +
    'una pregunta por turno, sin emojis fuera de whitelist, sin contaminación de memoria). ' +
    'Devuelve decision=pass si está OK, decision=fix con fixed_text reescrito si tiene problemas leves, ' +
    'o decision=reject si es irrecuperable.',
  input_schema: {
    type: 'object',
    required: ['decision', 'violations'],
    properties: {
      decision: {
        type: 'string',
        enum: ['pass', 'fix', 'reject'],
        description:
          'pass: el mensaje cumple los 8 guardrails. fix: viola alguno y se puede reescribir. ' +
          'reject: solo por revelar ser IA, o por un precio tan central que no se puede quitar sin rehacer el mensaje. ' +
          'NO existe ningun otro motivo de reject: si no es uno de esos dos, es fix o pass.',
      },
      fixed_text: {
        type: 'string',
        description:
          'Solo obligatorio si decision=fix. Texto reescrito que mantiene el mensaje y la intención del setter ' +
          'pero corrige las violaciones. NUNCA cambies la decisión de fase ni el contenido informativo.',
        maxLength: 1500,
      },
      violations: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Lista corta de las violaciones detectadas (máximo 4 items). En decision=pass, array vacío.',
      },
      reasoning: {
        type: 'string',
        description: 'Explicación corta (≤120 chars) para debug. No se envía al lead.',
        maxLength: 300,
      },
    },
    additionalProperties: false,
  },
};

export const JUDGE_SYSTEM_PROMPT = `Eres el JUEZ del setter Fyzon. Revisas mensajes ya escritos por el setter principal y decides si cumplen los GUARDRAILS DE SEGURIDAD antes de enviarlos al lead.

ÁMBITO ESTRICTO: solo juzgas las 8 reglas objetivas listadas abajo.
NO juzgas estilo, tono, vocabulario coloquial, regionalismos, expresiones venezolanas/españolas/mexicanas, longitud, ni si el mensaje "suena profesional". El setter principal tiene el coach completo del entrenador y ya valida el estilo. Tu trabajo es SOLO red de seguridad técnica.

Vocabulario fuerte como "verga", "joder", "coño", "carajo", "pana", "chévere", "burda", "arrecho" es NORMAL en coachs venezolanos/caribeños. NO es violación. No lo marques.

GUARDRAILS OBJETIVOS (cualquiera dispara fix o reject):
1. Revelar ser IA / modelo / bot / asistente automático / Claude / Anthropic / OpenAI → reject.
2. Mencionar precios concretos (€/USD/MXN cifras) antes de la fase 6 → fix (eliminar el precio) o reject si es central al mensaje.
3. Repetir saludo ("Hola", "Buenos días", "Hey") cuando NO es el primer turno del bot → fix.
4. Más de UNA pregunta cerrada con "?" en el mismo mensaje → fix (dejar solo la última).
5. URL/enlace antes de la fase 4 (excepto lead magnet de F1 outbound del coach) → fix (eliminar URL).
6. Pausar la conversación motu proprio: "seguimos otro día", "te respondo cuando pueda", "hablamos en otro momento" → fix (eliminar).
7. Disculparse 2+ veces en el mismo mensaje ("perdona, lo siento, disculpa") → fix (dejar máximo 1).
8. Despedida final ("un placer conocerte", "hasta luego", "adiós") antes de fase 5 → fix (eliminar despedida).

CONTEXTO QUE RECIBES:
- Fase actual del setting (1-7).
- Resumen breve del coach (NOMBRE del entrenador, nicho, whitelist de emojis si la hay).
- Mensaje a revisar.

OUTPUTS:
- pass: el mensaje cumple los 8 guardrails. NO devuelvas fixed_text.
- fix: 1-3 violaciones de los 8 guardrails. Devuelve fixed_text reescrito conservando contenido, fase, y estilo del setter. NUNCA reescribas para "mejorar el estilo" — solo para corregir el guardrail concreto.
- reject: SOLO dos casos, no hay mas. (a) revelar ser IA. (b) un precio tan central que quitarlo obliga a rehacer el mensaje entero.

Si te descubres razonando "no viola ninguno de los 8, pero aun asi..." — para: eso es un pass. Un reject deja al lead SIN NINGUN mensaje, que casi siempre es peor que el mensaje imperfecto que ibas a bloquear.

NO es motivo de reject, ni de fix: que el setter descarte a un lead que no encaja con el entrenador. Descartar bien es parte de su trabajo, no un fallo. El entrenador define en su bloque a quien atiende y con que palabras se despide; tu no revisas ese criterio ni en que fase se aplica.

Si dudas entre pass y fix, elige pass. La permisividad sobre vocabulario es DELIBERADA — el setter ya está alineado al coach.`;

interface RunJudgeDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

export async function runJudge(
  deps: RunJudgeDeps,
  input: JudgeInput,
): Promise<JudgeOutput> {
  const { supabase, anthropic } = deps;
  const model = input.model ?? DEFAULT_JUDGE_MODEL;

  const userParts: string[] = [
    `FASE ACTUAL: ${input.currentPhase}`,
  ];
  if (input.coachSummary) userParts.push(`COACH (resumen): ${input.coachSummary}`);
  if (input.conversationContext) userParts.push(`CONTEXTO: ${input.conversationContext}`);
  userParts.push(`MENSAJE A REVISAR:\n${input.messageRaw}`);

  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: JUDGE_MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: JUDGE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral', ttl: JUDGE_CACHE_TTL },
        },
      ] as unknown as Anthropic.Messages.TextBlockParam[],
      messages: [{ role: 'user', content: userParts.join('\n\n') }],
      tools: [judgeMessageTool] as unknown as Anthropic.Messages.Tool[],
      tool_choice: { type: 'tool', name: JUDGE_TOOL_NAME },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'judge',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: message,
      requestPayload: { model, max_tokens: JUDGE_MAX_TOKENS, msg_chars: input.messageRaw.length },
      responsePayload: { error: message },
    });
    throw err;
  }
  const latencyMs = Date.now() - startedAt;

  const toolUseBlock = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock =>
      c.type === 'tool_use' && c.name === JUDGE_TOOL_NAME,
  );
  if (!toolUseBlock) {
    const errMsg = `Judge did not return tool_use. stop_reason=${response.stop_reason}`;
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'judge',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: errMsg,
      requestPayload: { model, max_tokens: JUDGE_MAX_TOKENS },
      responsePayload: { stop_reason: response.stop_reason },
    });
    throw new Error(errMsg);
  }

  const toolInput = toolUseBlock.input as Record<string, unknown>;
  const decision = toolInput.decision as JudgeOutput['decision'];
  if (!['pass', 'fix', 'reject'].includes(decision)) {
    throw new Error(`Judge tool_use returned invalid decision: ${String(decision)}`);
  }
  const violations = Array.isArray(toolInput.violations)
    ? (toolInput.violations.filter((v) => typeof v === 'string') as string[])
    : [];

  let finalText = input.messageRaw;
  if (decision === 'fix') {
    if (typeof toolInput.fixed_text !== 'string' || toolInput.fixed_text.trim().length === 0) {
      throw new Error('Judge decision=fix but fixed_text is missing or empty');
    }
    finalText = toolInput.fixed_text;
  }

  const usage = response.usage;
  const tokensInUncached = usage.input_tokens ?? 0;
  const tokensInCacheRead = usage.cache_read_input_tokens ?? 0;
  const tokensInCacheWrite = usage.cache_creation_input_tokens ?? 0;
  const tokensOut = usage.output_tokens ?? 0;
  const costUsd = calculateCostUsd({
    model,
    tokensInUncached,
    tokensInCacheRead,
    tokensInCacheWrite,
    tokensOut,
    cacheTtl: JUDGE_CACHE_TTL,
  });

  const usageOut: GeneratorUsage = {
    tokensInUncached,
    tokensInCacheRead,
    tokensInCacheWrite,
    tokensOut,
    costUsd,
    latencyMs,
    stopReason: response.stop_reason ?? null,
  };

  const llmCallId = await logLlmCall({
    supabase,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    role: 'judge',
    model,
    status: 'success',
    usage: usageOut,
    requestPayload: {
      model,
      max_tokens: JUDGE_MAX_TOKENS,
      msg_chars: input.messageRaw.length,
      tool: JUDGE_TOOL_NAME,
    },
    responsePayload: {
      stop_reason: response.stop_reason,
      decision,
      violations_count: violations.length,
      reasoning: typeof toolInput.reasoning === 'string' ? toolInput.reasoning : undefined,
    },
  });

  return {
    decision,
    finalText,
    violations,
    reasoning: typeof toolInput.reasoning === 'string' ? toolInput.reasoning : undefined,
    usage: usageOut,
    llmCallId: llmCallId ?? undefined,
  };
}
