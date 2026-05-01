import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateCostUsd } from './cost.js';
import { logLlmCall } from './llm-call-log.js';
import type { AnthropicTool, GeneratorUsage } from './types.js';

export const DEFAULT_SPLITTER_MODEL = 'claude-haiku-4-5';
export const SPLITTER_TOOL_NAME = 'split_message';
const SPLITTER_MAX_TOKENS = 700;
const PART_MIN_CHARS = 20;
const PART_MAX_CHARS = 280;
const PART_COUNT_MIN = 1;
const PART_COUNT_MAX = 4;

export interface SplitterInput {
  finalText: string;
  /** Canal — Instagram permite mensajes algo más cortos por estética. */
  channel?: 'whatsapp' | 'instagram' | 'facebook';
  tenantId: number;
  conversationId: number | null;
  model?: string;
}

export interface SplitterOutput {
  parts: string[];
  usage: GeneratorUsage;
  llmCallId?: number;
  /** Si el splitter falló heurísticamente y se usó fallback determinístico. */
  fallback?: boolean;
}

export const splitMessageTool: AnthropicTool = {
  name: SPLITTER_TOOL_NAME,
  description:
    'Parte el mensaje del setter en 1-4 mensajes naturales tipo WhatsApp, cada uno entre 20 y 280 caracteres. ' +
    'NO añadas información nueva, NO cambies palabras, solo decide dónde partir para que cada parte sea un mensaje natural ' +
    'que un humano enviaría. Si el mensaje original ya cabe en una sola burbuja (≤280 chars), devuelve un único elemento.',
  input_schema: {
    type: 'object',
    required: ['parts'],
    properties: {
      parts: {
        type: 'array',
        minItems: PART_COUNT_MIN,
        maxItems: PART_COUNT_MAX,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: PART_MAX_CHARS,
        },
        description:
          'Array de 1-4 strings. Cada string debe tener entre 20 y 280 chars (excepción: si el original es <20, una única parte de menor longitud está permitida). Las partes deben juntarse semánticamente (sin perder palabras del original).',
      },
    },
    additionalProperties: false,
  },
};

const SPLITTER_SYSTEM_PROMPT = `Eres el SPLITTER del setter Fyzon. Tu único trabajo es partir el mensaje del setter en 1-4 mensajes naturales tipo WhatsApp.

REGLAS:
1. Cada parte: 20-280 caracteres (excepción: si el mensaje original es <20 chars, devuelve UNA sola parte tal cual).
2. NUNCA añadas palabras nuevas. NUNCA traduzcas. NUNCA cambies emojis ni signos de puntuación.
3. Parte por límites naturales: punto-y-aparte, doble salto de línea, transiciones lógicas.
4. Si hay UNA pregunta al final, déjala SIEMPRE en la última parte (no la pongas suelta sin contexto).
5. Si el mensaje cabe entero en ≤280 chars, devuelve UNA sola parte con el texto completo.
6. Mantén orden lógico: parte_1 antes que parte_2, etc.

NO modifiques contenido. SOLO decides cortes.`;

interface RunSplitterDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

export async function runSplitter(
  deps: RunSplitterDeps,
  input: SplitterInput,
): Promise<SplitterOutput> {
  const { supabase, anthropic } = deps;
  const model = input.model ?? DEFAULT_SPLITTER_MODEL;

  // Fast path: si el texto ya cabe en una burbuja, no llamamos al modelo.
  if (input.finalText.length <= PART_MAX_CHARS) {
    return {
      parts: [input.finalText],
      usage: zeroUsage(),
      fallback: true,
    };
  }

  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: SPLITTER_MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SPLITTER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ] as unknown as Anthropic.Messages.TextBlockParam[],
      messages: [
        {
          role: 'user',
          content: `CANAL: ${input.channel ?? 'instagram'}\n\nMENSAJE A PARTIR:\n${input.finalText}`,
        },
      ],
      tools: [splitMessageTool] as unknown as Anthropic.Messages.Tool[],
      tool_choice: { type: 'tool', name: SPLITTER_TOOL_NAME },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await logLlmCall({
      supabase,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: 'splitter',
      model,
      status: 'error',
      usage: { latencyMs },
      errorMessage: message,
      requestPayload: { model, max_tokens: SPLITTER_MAX_TOKENS, msg_chars: input.finalText.length },
      responsePayload: { error: message },
    });
    // Fallback determinístico: parte por punto-y-aparte / doble salto.
    return {
      parts: deterministicSplit(input.finalText),
      usage: { ...zeroUsage(), latencyMs },
      fallback: true,
    };
  }
  const latencyMs = Date.now() - startedAt;

  const toolUseBlock = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock =>
      c.type === 'tool_use' && c.name === SPLITTER_TOOL_NAME,
  );

  let parts: string[];
  let fallback = false;
  if (!toolUseBlock) {
    parts = deterministicSplit(input.finalText);
    fallback = true;
  } else {
    const raw = (toolUseBlock.input as { parts?: unknown }).parts;
    if (!Array.isArray(raw) || raw.length === 0) {
      parts = deterministicSplit(input.finalText);
      fallback = true;
    } else {
      parts = raw
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
      if (parts.length === 0) {
        parts = deterministicSplit(input.finalText);
        fallback = true;
      } else if (parts.length > PART_COUNT_MAX) {
        parts = parts.slice(0, PART_COUNT_MAX);
      }
    }
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
    role: 'splitter',
    model,
    status: 'success',
    usage: usageOut,
    requestPayload: {
      model,
      max_tokens: SPLITTER_MAX_TOKENS,
      msg_chars: input.finalText.length,
      tool: SPLITTER_TOOL_NAME,
    },
    responsePayload: {
      stop_reason: response.stop_reason,
      parts_count: parts.length,
      fallback,
      part_lengths: parts.map((p) => p.length),
    },
  });

  return {
    parts,
    usage: usageOut,
    llmCallId: llmCallId ?? undefined,
    fallback,
  };
}

function zeroUsage(): GeneratorUsage {
  return {
    tokensInUncached: 0,
    tokensInCacheRead: 0,
    tokensInCacheWrite: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: 0,
    stopReason: null,
  };
}

/**
 * Fallback determinístico: parte por doble salto de línea, luego por punto-y-aparte,
 * y como último recurso por longitud máxima.
 */
export function deterministicSplit(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= PART_MAX_CHARS) return [trimmed];

  // 1. Doble salto de línea
  const byParagraph = trimmed
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byParagraph.length > 1 && byParagraph.length <= PART_COUNT_MAX && byParagraph.every((p) => p.length <= PART_MAX_CHARS)) {
    return byParagraph;
  }

  // 2. Punto seguido + espacio
  const bySentence = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bySentence.length > 1 && bySentence.length <= PART_COUNT_MAX && bySentence.every((p) => p.length <= PART_MAX_CHARS)) {
    return bySentence;
  }

  // 3. Hard split por longitud
  const out: string[] = [];
  let current = trimmed;
  while (current.length > PART_MAX_CHARS && out.length < PART_COUNT_MAX - 1) {
    let cut = current.lastIndexOf(' ', PART_MAX_CHARS);
    if (cut < PART_MAX_CHARS / 2) cut = PART_MAX_CHARS;
    out.push(current.slice(0, cut).trim());
    current = current.slice(cut).trim();
  }
  if (current.length > 0) out.push(current);
  return out;
}
