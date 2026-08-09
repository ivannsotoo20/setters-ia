import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { composePrompt } from '@fyzon/prompt-composer';
import { calculateCostUsd } from './cost.js';
import { logLlmCall, summarizeSetterOutput } from './llm-call-log.js';
import { buildRespondAsSetterTool, RESPOND_AS_SETTER_TOOL_NAME } from './tool-definition.js';
import type { GeneratorInput, GeneratorOutput, SetterToolOutput } from './types.js';

/**
 * Modelo default del Generator.
 *
 * Historia:
 * - Sonnet 4.5 + cache 5min (hasta 2026-05-07): ~4.5 céntimos / mensaje. Inviable.
 * - Haiku 4.5 + cache TTL 1h (2026-05-07 → 2026-08-09): ~0.43 céntimos / mensaje.
 * - Sonnet 5 + cache TTL 1h (desde 2026-08-09).
 *
 * Por qué se vuelve a Sonnet: el cuello de botella dejó de ser el coste y pasó a
 * ser la calidad de la conversación. Los bloques coach actuales (el de Tania son
 * 33k chars) llevan voz, criterios de cualificación y manejo de objeciones con
 * mucho matiz, y ahí la diferencia entre Haiku y Sonnet se nota en cada turno.
 *
 * Lo que cuesta: Sonnet 5 son $3/$15 por millón de tokens frente a $1/$5 de
 * Haiku, y además su tokenizador cuenta ~35% más para el mismo prompt (medido:
 * 38.467 vs 28.470 tokens sobre el mismo prefijo). En conjunto, del orden de 5×
 * por turno. Con el cache de 1h sigue siendo un coste asumible por conversación,
 * pero conviene mirarlo en `llm_calls` en cuanto haya volumen real.
 *
 * ⚠️ Esta constante es GLOBAL, no por tenant: cambiarla mueve a todos los
 * tenants a la vez.
 *
 * Override por env (`GENERATOR_MODEL`) para A/B y tests.
 */
export const DEFAULT_GENERATOR_MODEL = 'claude-sonnet-5';
/**
 * Techo de salida. La respuesta real más larga observada en producción son 579
 * tokens (media 347, p95 491), así que 1024 sobraba con Haiku.
 *
 * Con Sonnet 5 hay que dar más margen: `max_tokens` acota el pensamiento y la
 * respuesta JUNTOS. Si el modelo razonara más de lo que sobra, la llamada a la
 * herramienta se cortaría a medias y el Generator lanzaría un error, en vez de
 * dar una respuesta peor. Aquí abajo se desactiva el pensamiento (ver la llamada
 * a `messages.create`), pero el margen se deja de todas formas para que activarlo
 * más adelante no reviente nada.
 *
 * No es un coste: solo se paga lo que se genera.
 */
const DEFAULT_MAX_TOKENS = 4096;
/** TTL del cache_control que el composer emite. Sincronizado con `cacheTtl` default del builder. */
const CACHE_TTL: '1h' = '1h';

interface RunGeneratorDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

/**
 * Ejecuta el Generator: compone el system prompt, llama al modelo con
 * `tool_choice` forzado a `respond_as_setter`, parsea la respuesta y registra la
 * llamada en `llm_calls`.
 *
 * Errores que propaga:
 *  - Anthropic API error (network, rate limit, 5xx).
 *  - El modelo no usó la tool requerida.
 *  - El JSON del tool_use no cumple el shape mínimo.
 *
 * No propaga: errores al insertar en llm_calls (best-effort, log warning).
 */
export async function runGenerator(
  deps: RunGeneratorDeps,
  input: GeneratorInput,
): Promise<GeneratorOutput> {
  const { supabase, anthropic } = deps;
  const model = input.model ?? DEFAULT_GENERATOR_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  // Hito 12.1 — cap del trainer propagado a la tool definition: limita
  // `message_raw.maxLength` a `maxParts × 280 + 30` chars. Si el modelo intenta
  // pasarse, Anthropic rechaza el tool_use por schema validation.
  const aiMessagesPerTurnMax: 1 | 2 | 3 | 4 = input.aiMessagesPerTurnMax ?? 4;
  const respondTool = buildRespondAsSetterTool({ maxParts: aiMessagesPerTurnMax });

  // 1. Compose system prompt (Cerebro v5 — cargado desde Supabase, con cache_control)
  //
  // En v5 los 11 bloques shared del v4 se han consolidado en 2 (core_v5_base + output_contract_v5).
  // Ya no se eligen bloques por fase ni por flags isHandoff/includeObjections/etc.
  // El marker de fase activa pasa por:
  //   - currentPhaseFocus: instrucción focal corta inyectada en {{current_phase_focus}} del CORE.
  //   - currentPhase: se usa para resolver priority="active|reference" en las etiquetas <phaseN>.
  const composed = await composePrompt(supabase, {
    tenantId: input.tenantId,
    currentPhase: input.currentPhase,
    currentPhaseFocus: input.composeOverrides?.currentPhaseFocus,
    trackedCalendarUrl: input.composeOverrides?.trackedCalendarUrl,
    availableSlots: input.composeOverrides?.availableSlots,
    currentDateIso: input.composeOverrides?.currentDateIso,
    leadContact: input.composeOverrides?.leadContact,
    leadTimezoneLabel: input.composeOverrides?.leadTimezoneLabel,
    trainerTimezoneLabel: input.composeOverrides?.trainerTimezoneLabel,
    // Hito 12.1 — extraSystemSuffix (directiva mirror_lead u otros append-only futuros).
    extraSystemSuffix: input.composeOverrides?.extraSystemSuffix,
  });

  // 2. Construye messages[] para la API (history + último mensaje del lead)
  const messages = [
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: input.userMessage },
  ];

  // 3. Llamada a Anthropic
  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: composed.systemContent as unknown as Anthropic.Messages.TextBlockParam[],
      messages,
      tools: [respondTool] as unknown as Anthropic.Messages.Tool[],
      tool_choice: { type: 'tool', name: RESPOND_AS_SETTER_TOOL_NAME },
      // Pensamiento DESACTIVADO a propósito, y hay que ponerlo explícito: en
      // Sonnet 5 omitir este campo NO significa "sin pensamiento", significa
      // pensamiento adaptativo activado. Sin esta línea el cambio de modelo
      // traería dos cambios de comportamiento a la vez y sería imposible saber
      // a cuál atribuir lo que se observe.
      //
      // Se mantiene desactivado porque el setter es una conversación de ida y
      // vuelta donde la latencia se nota, y porque la salida va forzada a una
      // sola herramienta. Activarlo es una segunda prueba, con su propia medida.
      thinking: { type: 'disabled' },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'generator',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: message,
      requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
      responsePayload: { error: message },
    });
    throw err;
  }
  const latencyMs = Date.now() - startedAt;

  // 4. Extrae el tool_use
  const toolUseBlock = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock =>
      c.type === 'tool_use' && c.name === RESPOND_AS_SETTER_TOOL_NAME,
  );
  if (!toolUseBlock) {
    const errMsg = `Generator did not return tool_use for ${RESPOND_AS_SETTER_TOOL_NAME}. stop_reason=${response.stop_reason}`;
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'generator',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: errMsg,
      requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
      responsePayload: { stop_reason: response.stop_reason, content: response.content.map((c) => c.type) },
    });
    throw new Error(errMsg);
  }

  const setterOutput = validateSetterOutput(toolUseBlock.input);

  // 5. Calcula tokens y coste
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
    cacheTtl: CACHE_TTL,
  });

  // 6. Registra llm_calls (best-effort)
  const llmCallId = await logLlmCall({
    supabase,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    role: 'generator',
    model,
    status: 'success',
    usage: {
      tokensInUncached,
      tokensInCacheRead,
      tokensInCacheWrite,
      tokensOut,
      costUsd,
      latencyMs,
      stopReason: response.stop_reason ?? null,
    },
    requestPayload: summarizeRequest(composed.metadata, messages.length, model, maxTokens),
    responsePayload: {
      stop_reason: response.stop_reason,
      ...summarizeSetterOutput(setterOutput),
    },
  });

  return {
    setterOutput,
    usage: {
      tokensInUncached,
      tokensInCacheRead,
      tokensInCacheWrite,
      tokensOut,
      costUsd,
      latencyMs,
      stopReason: response.stop_reason ?? null,
    },
    composedPromptMeta: composed.metadata,
    model,
    llmCallId: llmCallId ?? undefined,
  };
}

function summarizeRequest(
  composedMeta: { totalChars: number; blockCount: number; cacheBreakpoints: number; blocksLoaded: string[] },
  messagesCount: number,
  model: string,
  maxTokens: number,
): Record<string, unknown> {
  return {
    model,
    max_tokens: maxTokens,
    system_chars: composedMeta.totalChars,
    system_blocks: composedMeta.blocksLoaded,
    cache_breakpoints: composedMeta.cacheBreakpoints,
    messages_count: messagesCount,
    tool: RESPOND_AS_SETTER_TOOL_NAME,
  };
}

/** Valida que el shape devuelto por el modelo cumple `SetterToolOutput`. */
export function validateSetterOutput(raw: unknown): SetterToolOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Generator tool_use input is not an object: ${typeof raw}`);
  }
  const r = raw as Record<string, unknown>;

  const message_raw = r.message_raw;
  if (typeof message_raw !== 'string' || message_raw.length === 0) {
    throw new Error('Generator tool_use missing or empty `message_raw`');
  }

  const conversation_status = r.conversation_status;
  if (
    typeof conversation_status !== 'string' ||
    !['active', 'qualified', 'disqualified', 'handoff', 'paused'].includes(conversation_status)
  ) {
    throw new Error(`Generator tool_use invalid conversation_status: ${String(conversation_status)}`);
  }

  const phase_decision = r.phase_decision;
  if (
    typeof phase_decision !== 'number' ||
    !Number.isInteger(phase_decision) ||
    phase_decision < 1 ||
    phase_decision > 7
  ) {
    throw new Error(`Generator tool_use invalid phase_decision: ${String(phase_decision)}`);
  }

  return {
    message_raw,
    user_summary: typeof r.user_summary === 'string' ? r.user_summary : undefined,
    conversation_status: conversation_status as SetterToolOutput['conversation_status'],
    phase_decision,
    resources_to_send: Array.isArray(r.resources_to_send)
      ? (r.resources_to_send.filter((x) => typeof x === 'string') as string[])
      : undefined,
    handoff_cause:
      typeof r.handoff_cause === 'string' &&
      ['A_agenda', 'B_derivacion', 'C_descualificado', 'D_espera', 'E_error'].includes(r.handoff_cause)
        ? (r.handoff_cause as SetterToolOutput['handoff_cause'])
        : undefined,
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
    // Razonamiento estructurado por turno (opcional). Cualquier campo no string
    // queda undefined y persiste como NULL en BD (sin regresión).
    emotion: typeof r.emotion === 'string' ? r.emotion : undefined,
    problem: typeof r.problem === 'string' ? r.problem : undefined,
    goal: typeof r.goal === 'string' ? r.goal : undefined,
    urgency: typeof r.urgency === 'string' ? r.urgency : undefined,
    next_action: typeof r.next_action === 'string' ? r.next_action : undefined,
    general_context: typeof r.general_context === 'string' ? r.general_context : undefined,
    general_motivation:
      typeof r.general_motivation === 'string' ? r.general_motivation : undefined,
    // Hito 10.6 — API booking. Solo aceptamos string no vacío. Validación de
    // formato ISO 8601 la hace el caller (motor → bookAppointmentFromSlot).
    proposed_booking_slot:
      typeof r.proposed_booking_slot === 'string' && r.proposed_booking_slot.trim() !== ''
        ? r.proposed_booking_slot.trim()
        : undefined,
    // Hito 10.6.1 — Captura email/nombre del lead. Sanitizar (trim + lowercase email).
    captured_lead_email:
      typeof r.captured_lead_email === 'string' && r.captured_lead_email.trim() !== ''
        ? r.captured_lead_email.trim().toLowerCase()
        : undefined,
    captured_lead_name:
      typeof r.captured_lead_name === 'string' && r.captured_lead_name.trim() !== ''
        ? r.captured_lead_name.trim()
        : undefined,
  };
}
