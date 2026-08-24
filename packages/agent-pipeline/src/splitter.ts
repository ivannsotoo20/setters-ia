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
/**
 * Techo absoluto del cap (hardcap del sistema). El cap efectivo por turno se
 * calcula con `Math.min(PART_COUNT_MAX, maxParts ?? PART_COUNT_MAX)` para que el
 * trainer pueda bajar a 1, 2 o 3 vía `aiMessagesPerTurnMax` (Hito 12.1).
 */
const PART_COUNT_MAX = 4;
const DEFAULT_MAX_PARTS: 1 | 2 | 3 | 4 = 4;

export interface SplitterInput {
  finalText: string;
  /** Canal — Instagram permite mensajes algo más cortos por estética. */
  channel?: 'whatsapp' | 'instagram' | 'facebook';
  tenantId: number;
  conversationId: number | null;
  model?: string;
  /**
   * Hito 12.1 — Cap dinámico de partes. Si undefined → default 4 (baseline).
   * Si <1 o >4 se clampa al rango válido. El motor lo carga de
   * `trainer_preferences.preferences.aiMessagesPerTurnMax`.
   */
  maxParts?: 1 | 2 | 3 | 4;
}

export interface SplitterOutput {
  parts: string[];
  usage: GeneratorUsage;
  llmCallId?: number;
  /** Si el splitter falló heurísticamente y se usó fallback determinístico. */
  fallback?: boolean;
}

/**
 * Hito 12.1 — Factory que construye la tool del Splitter con `maxItems` dinámico
 * según el cap `maxParts`. Antes era una constante con cap hardcoded a 4. Ahora
 * el trainer puede bajar a 1/2/3 vía `aiMessagesPerTurnMax` en sus preferencias.
 */
/**
 * Si el texto contiene exactamente UNA URL con texto alrededor y hay hueco de
 * partes, la separa en su propia burbuja: [antes, URL, después], sin vacíos.
 *
 * Devuelve null cuando NO aplica: sin URL, URL ya sola, varias URLs (raro, y
 * partir mal es peor que no partir), o cap de 1 parte. Si los trozos no caben
 * en el cap, el texto de después se pega DEBAJO de la URL (nunca se pierden
 * palabras y la URL sigue abriendo su burbuja).
 */
export function splitUrlIntoOwnPart(text: string, maxParts: number): string[] | null {
  if (maxParts < 2) return null;
  const urls = text.match(/https?:\/\/\S+/g);
  if (!urls || urls.length !== 1) return null;
  const url = urls[0]!;
  const idx = text.indexOf(url);
  const before = text.slice(0, idx).trim();
  const after = text.slice(idx + url.length).trim();
  if (!before && !after) return null;

  const parts = [before, url, after].filter(Boolean);
  if (parts.length <= maxParts) return parts;
  // 3 trozos y cap 2: la URL encabeza la segunda burbuja y el remate va debajo.
  return [before, `${url}\n\n${after}`];
}

export function buildSplitMessageTool(maxParts: 1 | 2 | 3 | 4 = DEFAULT_MAX_PARTS): AnthropicTool {
  return {
    name: SPLITTER_TOOL_NAME,
    description:
      `Parte el mensaje del setter en 1-${maxParts} mensaje(s) natural(es) tipo WhatsApp, cada uno entre 20 y 280 caracteres. ` +
      `NO añadas información nueva, NO cambies palabras, solo decide dónde partir para que cada parte sea un mensaje natural ` +
      `que un humano enviaría. Si el mensaje original ya cabe en una sola burbuja (≤280 chars), devuelve un único elemento — ` +
      `salvo que contenga una URL: la URL va SIEMPRE sola en su propia parte.`,
    input_schema: {
      type: 'object',
      required: ['parts'],
      properties: {
        parts: {
          type: 'array',
          minItems: PART_COUNT_MIN,
          maxItems: maxParts,
          items: {
            type: 'string',
            minLength: 1,
            maxLength: PART_MAX_CHARS,
          },
          description:
            `Array de 1-${maxParts} string(s). Cada string debe tener entre 20 y 280 chars (excepción: si el original es <20, una única parte de menor longitud está permitida). Las partes deben juntarse semánticamente (sin perder palabras del original).`,
        },
      },
      additionalProperties: false,
    },
  };
}

/**
 * Hito 12.1 — Export legacy de compatibilidad: tool con el cap default (4).
 * Tests y consumidores que no propagan `maxParts` usan esta versión.
 */
export const splitMessageTool: AnthropicTool = buildSplitMessageTool();

function buildSplitterSystemPrompt(maxParts: 1 | 2 | 3 | 4): string {
  return `Eres el SPLITTER del setter Fyzon. Tu único trabajo es partir el mensaje del setter en 1-${maxParts} mensaje(s) natural(es) tipo WhatsApp.

REGLAS:
1. Cada parte: 20-280 caracteres (excepción: si el mensaje original es <20 chars, devuelve UNA sola parte tal cual; una URL sola también puede ser parte, mida lo que mida).
2. NUNCA añadas palabras nuevas. NUNCA traduzcas. NUNCA cambies emojis ni signos de puntuación.
3. Parte por límites naturales: punto-y-aparte, doble salto de línea, transiciones lógicas.
4. Si hay UNA pregunta al final, déjala SIEMPRE en la última parte (no la pongas suelta sin contexto).
5. Si el mensaje cabe entero en ≤280 chars, devuelve UNA sola parte con el texto completo — SALVO la regla 8.
6. Mantén orden lógico: parte_1 antes que parte_2, etc.
7. **Hito 12.1 — Cap estricto**: NUNCA devuelvas más de ${maxParts} parte(s). Este es el techo configurado por el trainer.
8. **URL en su propia burbuja**: si el mensaje contiene una URL (http/https), la URL va SOLA en su propia parte, sin texto antes ni después en esa parte. Esto aplica AUNQUE el mensaje entero cupiera en 280 chars (excepción a la regla 5). Un enlace pegado a un párrafo se lee peor y se toca peor en móvil. Única excepción: si el cap es 1 parte, va todo junto.

NO modifiques contenido. SOLO decides cortes.`;
}

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
  // Hito 12.1 — Cap efectivo: min(hardcap del schema, cap del trainer). Default 4.
  const requestedMaxParts = input.maxParts ?? DEFAULT_MAX_PARTS;
  const effectiveMaxParts = (
    requestedMaxParts < 1 ? 1 : requestedMaxParts > PART_COUNT_MAX ? PART_COUNT_MAX : requestedMaxParts
  ) as 1 | 2 | 3 | 4;

  // Fast path: si el texto ya cabe en una burbuja, no llamamos al modelo.
  //
  // …salvo que lleve una URL con texto alrededor: los coach ordenan "el enlace
  // en su propia burbuja" y este atajo se lo tragaba (el mensaje de fase 6 con
  // el enlace mide ~160 chars y salía como UNA burbuja con texto+URL pegados).
  // La separación es determinística: más fiable y más barata que el modelo.
  if (input.finalText.length <= PART_MAX_CHARS) {
    const urlParts = splitUrlIntoOwnPart(input.finalText, effectiveMaxParts);
    return {
      parts: urlParts ?? [input.finalText],
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
          text: buildSplitterSystemPrompt(effectiveMaxParts),
          // TTL 1h alineado con composer y Judge (ver plan playful-petting-pine.md §3.5).
          cache_control: { type: 'ephemeral', ttl: '1h' },
        },
      ] as unknown as Anthropic.Messages.TextBlockParam[],
      messages: [
        {
          role: 'user',
          content: `CANAL: ${input.channel ?? 'instagram'}\n\nMENSAJE A PARTIR:\n${input.finalText}`,
        },
      ],
      tools: [buildSplitMessageTool(effectiveMaxParts)] as unknown as Anthropic.Messages.Tool[],
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
      requestPayload: { model, max_tokens: SPLITTER_MAX_TOKENS, msg_chars: input.finalText.length, max_parts: effectiveMaxParts },
      responsePayload: { error: message },
    });
    // Fallback determinístico: parte por punto-y-aparte / doble salto, respetando el cap.
    return {
      parts: deterministicSplit(input.finalText, effectiveMaxParts),
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
    parts = deterministicSplit(input.finalText, effectiveMaxParts);
    fallback = true;
  } else {
    const raw = (toolUseBlock.input as { parts?: unknown }).parts;
    if (!Array.isArray(raw) || raw.length === 0) {
      parts = deterministicSplit(input.finalText, effectiveMaxParts);
      fallback = true;
    } else {
      parts = raw
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
      if (parts.length === 0) {
        parts = deterministicSplit(input.finalText, effectiveMaxParts);
        fallback = true;
      } else if (parts.length > effectiveMaxParts) {
        // Hito 12.1 — clamp al cap del trainer (no al hardcap del sistema).
        parts = parts.slice(0, effectiveMaxParts);
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
    cacheTtl: '1h',
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
      max_parts: effectiveMaxParts,
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
 *
 * Hito 12.1 — Acepta `maxParts` opcional (default 4 = hardcap). Cuando el trainer
 * configura `aiMessagesPerTurnMax` < 4, el fallback respeta el cap también.
 * Importante: si el texto es demasiado largo para caber dentro de `maxParts × 280`
 * caracteres, el último elemento puede exceder los 280 chars (es la única manera
 * de no perder contenido). El caller (motor) debería evitarlo limitando la
 * longitud del Generator output proporcionalmente.
 */
export function deterministicSplit(text: string, maxParts: 1 | 2 | 3 | 4 = DEFAULT_MAX_PARTS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= PART_MAX_CHARS) return [trimmed];

  // 1. Doble salto de línea
  const byParagraph = trimmed
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byParagraph.length > 1 && byParagraph.length <= maxParts && byParagraph.every((p) => p.length <= PART_MAX_CHARS)) {
    return byParagraph;
  }

  // 2. Punto seguido + espacio
  const bySentence = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bySentence.length > 1 && bySentence.length <= maxParts && bySentence.every((p) => p.length <= PART_MAX_CHARS)) {
    return bySentence;
  }

  // 3. Hard split por longitud (respetando el cap del trainer)
  const out: string[] = [];
  let current = trimmed;
  while (current.length > PART_MAX_CHARS && out.length < maxParts - 1) {
    let cut = current.lastIndexOf(' ', PART_MAX_CHARS);
    if (cut < PART_MAX_CHARS / 2) cut = PART_MAX_CHARS;
    out.push(current.slice(0, cut).trim());
    current = current.slice(cut).trim();
  }
  if (current.length > 0) out.push(current);
  return out;
}
