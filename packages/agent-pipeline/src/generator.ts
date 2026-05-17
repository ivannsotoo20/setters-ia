import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { composePrompt } from '@fyzon/prompt-composer';
import { calculateCostUsd } from './cost.js';
import { logLlmCall, summarizeSetterOutput } from './llm-call-log.js';
import { respondAsSetterTool, RESPOND_AS_SETTER_TOOL_NAME } from './tool-definition.js';
import type { GeneratorInput, GeneratorOutput, SetterToolOutput } from './types.js';

/**
 * Modelo default del Generator. Cambió de Sonnet 4.5 → Haiku 4.5 el 2026-05-07
 * tras smoke real en tenant_id=3 (ver plan playful-petting-pine.md sección 3.5):
 *
 * - Coste medio observado con Sonnet + cache 5min en conversación con leads
 *   humanos: ~4.5 céntimos / mensaje. Inviable para SaaS.
 * - Cambio a Haiku 4.5 + cache TTL 1h: ~0.43 céntimos / mensaje promedio.
 * - Benchmark BenchLM/Galaxy.ai 2026: Haiku 4.5 lidera instruction-following
 *   en system prompts complejos (Cerebro v4 + Coach = 11k tokens), métrica
 *   crítica para el setter Fyzon.
 *
 * Override por env (`GENERATOR_MODEL`) para A/B y tests.
 */
export const DEFAULT_GENERATOR_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 1024;
/** TTL del cache_control que el composer emite. Sincronizado con `cacheTtl` default del builder. */
const CACHE_TTL: '1h' = '1h';

interface RunGeneratorDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

/**
 * Ejecuta el Generator: compone el system prompt, llama a Anthropic Sonnet 4.5
 * con `tool_choice` forzado a `respond_as_setter`, parsea la respuesta y
 * registra la llamada en `llm_calls`.
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

  // 1. Compose system prompt (cargado desde Supabase, con cache_control)
  // v4: handoff opcional (default false). objeciones / descualificacion / output_contract
  // se cargan por defecto (universales en el Cerebro v4).
  const composed = await composePrompt(supabase, {
    tenantId: input.tenantId,
    currentPhase: input.currentPhase,
    isHandoff: input.composeOverrides?.isHandoff ?? false,
    includeObjections: input.composeOverrides?.includeObjections ?? true,
    includeDescualificacion: input.composeOverrides?.includeDescualificacion ?? true,
    includeOutputContract: input.composeOverrides?.includeOutputContract ?? true,
    // Hito 10 — Inyecta URL trackable del calendario default para fase_6_v4.
    trackedCalendarUrl: input.composeOverrides?.trackedCalendarUrl,
    // Hito 10.6 — Inyecta slots disponibles para API booking en fase_6_v4.
    availableSlots: input.composeOverrides?.availableSlots,
    // Hito 10.6.1 — Inyecta fecha actual + estado de contacto del lead.
    currentDateIso: input.composeOverrides?.currentDateIso,
    leadContact: input.composeOverrides?.leadContact,
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
      tools: [respondAsSetterTool] as unknown as Anthropic.Messages.Tool[],
      tool_choice: { type: 'tool', name: RESPOND_AS_SETTER_TOOL_NAME },
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
