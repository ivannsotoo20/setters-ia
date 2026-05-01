import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratorUsage, SetterToolOutput } from './types.js';

interface LogLlmCallParams {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number | null;
  role: 'generator' | 'judge' | 'splitter' | 'transcriber' | 'embedder';
  model: string;
  status: 'success' | 'error' | 'fallback';
  usage: Partial<GeneratorUsage>;
  /** Opcional. Solo para errores. */
  errorMessage?: string;
  /** Resumen del prompt enviado (no guardamos texto completo). */
  requestPayload: Record<string, unknown>;
  /** Resumen de la respuesta. */
  responsePayload: Record<string, unknown>;
}

/**
 * Inserta una fila en `llm_calls`. Si falla, log warning pero NO propaga.
 * Devuelve el id generado o null si la inserción falló.
 */
export async function logLlmCall(params: LogLlmCallParams): Promise<number | null> {
  const {
    supabase,
    tenantId,
    conversationId,
    role,
    model,
    status,
    usage,
    errorMessage,
    requestPayload,
    responsePayload,
  } = params;

  const tokensIn =
    (usage.tokensInUncached ?? 0) +
    (usage.tokensInCacheRead ?? 0) +
    (usage.tokensInCacheWrite ?? 0);

  const row = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    provider: 'anthropic' as const,
    model,
    role,
    status,
    tokens_in: tokensIn || null,
    tokens_in_cached: usage.tokensInCacheRead ?? null,
    tokens_out: usage.tokensOut ?? null,
    cost: usage.costUsd ?? null,
    latency_ms: usage.latencyMs ?? null,
    error_message: errorMessage ?? null,
    request_payload: requestPayload,
    response_payload: responsePayload,
  };

  const { data, error } = await supabase
    .from('llm_calls')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[llm-call-log] insert failed (non-fatal):', error.message);
    return null;
  }
  return data ? Number(data.id) : null;
}

/** Resumen seguro del setter output para guardar en response_payload. */
export function summarizeSetterOutput(out: SetterToolOutput): Record<string, unknown> {
  return {
    message_raw_chars: out.message_raw.length,
    message_raw_preview: out.message_raw.slice(0, 200),
    user_summary: out.user_summary,
    conversation_status: out.conversation_status,
    phase_decision: out.phase_decision,
    resources_to_send: out.resources_to_send,
    handoff_cause: out.handoff_cause,
    reasoning: out.reasoning,
  };
}
