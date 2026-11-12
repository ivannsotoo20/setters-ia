/**
 * Claude Sonnet vision — descripción de imágenes inbound (Bloque D, 2026-05-08).
 *
 * Recibe el cliente Anthropic del caller (en el motor, `getAnthropicForTenant`:
 * la llamada va contra la clave del tenant si tiene una). La imagen se descarga
 * del media_url, se codifica base64 y se envía como content block multimodal.
 *
 * Modelo: `claude-sonnet-5`, el mismo del Generator. Hasta 2026-11-12 era
 * `claude-sonnet-4-5`, que Anthropic retira el 2026-11-30: a partir de ese día
 * cada imagen habría caído al placeholder "no se pudo procesar".
 *
 * Pensamiento APAGADO explícito, igual que el Generator: en Sonnet 5 omitir
 * `thinking` activa el pensamiento adaptativo (más tokens de salida, más
 * latencia) y para describir una foto no aporta nada. OJO si se cambia el
 * modelo: en Sonnet 5.5 y Opus 5.5 `{ type: 'disabled' }` devuelve 400.
 *
 * Coste: $2/M input (incluye los tokens de imagen, ~1.5K por imagen estándar de
 * un DM) + $10/M output. Total típico ~0.003-0.006 USD/imagen. El caller lo
 * registra en `llm_calls` (ver `enrich-media-messages.ts`).
 */

import type Anthropic from '@anthropic-ai/sdk';
import { calculateCostUsd } from '@fyzon/agent-pipeline';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // Claude vision limit
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;
export const DESCRIBE_IMAGE_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS_OUT = 500;

const DEFAULT_PROMPT_HINT =
  'Describe brevemente esta imagen para que un agente IA pueda continuar la conversación con el usuario que la envió. Si hay texto en la imagen, transcríbelo. Si es captura de pantalla, contenido específico, gráfico, etc, sé concreto. Máximo 3-4 frases.';

export interface DescribeImageInput {
  /** URL HTTP/S de la imagen. */
  url: string;
  /** Cliente Anthropic (de getAnthropic()). */
  anthropic: Anthropic;
  /** Override del prompt hint. */
  promptHint?: string;
  /** Override modelo (default `DESCRIBE_IMAGE_MODEL`). */
  model?: string;
  /** Bytes máximos al descargar (default 5MB). */
  maxBytes?: number;
  /** Timeout descarga ms (default 30000). */
  downloadTimeoutMs?: number;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

export interface DescribeImageResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  mediaType: string;
  /** Duración de la llamada a Anthropic (sin contar la descarga). */
  latencyMs: number;
}

export type DescribeImageErrorReason =
  | 'download_failed'
  | 'download_timeout'
  | 'file_too_large'
  | 'unsupported_media_type'
  | 'anthropic_error'
  | 'empty_response';

/**
 * Datos de la llamada a Anthropic cuando el error ocurre DESPUÉS de hacerla
 * (`anthropic_error`, `empty_response`), para que el caller la registre en
 * `llm_calls`. En `empty_response` los tokens se cobraron igual. Los errores de
 * descarga no llegan a llamar al modelo y no lo llevan.
 */
export interface DescribeImageCallInfo {
  model: string;
  mediaType: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export class DescribeImageError extends Error {
  readonly reason: DescribeImageErrorReason;
  readonly call?: DescribeImageCallInfo;
  constructor(reason: DescribeImageErrorReason, message: string, call?: DescribeImageCallInfo) {
    super(message);
    this.name = 'DescribeImageError';
    this.reason = reason;
    this.call = call;
  }
}

export async function describeImage(input: DescribeImageInput): Promise<DescribeImageResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const model = input.model ?? DESCRIBE_IMAGE_MODEL;
  const promptHint = input.promptHint ?? DEFAULT_PROMPT_HINT;

  // 1. Descargar imagen
  const { buffer, contentType } = await downloadImage(
    input.url,
    fetchImpl,
    input.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    maxBytes,
  );

  const mediaType = normalizeMediaType(contentType, input.url);
  if (!isSupportedMediaType(mediaType)) {
    throw new DescribeImageError(
      'unsupported_media_type',
      `unsupported media_type ${mediaType} (Claude vision soporta jpeg/png/gif/webp)`,
    );
  }

  // 2. Llamada Anthropic multimodal
  const startedAt = Date.now();
  let response;
  try {
    response = await input.anthropic.messages.create({
      model,
      max_tokens: DEFAULT_MAX_TOKENS_OUT,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: Buffer.from(buffer).toString('base64'),
              },
            },
            { type: 'text', text: promptHint },
          ],
        },
      ],
    });
  } catch (err) {
    throw new DescribeImageError(
      'anthropic_error',
      `Anthropic vision call failed: ${(err as Error).message}`,
      {
        model,
        mediaType,
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      },
    );
  }
  const latencyMs = Date.now() - startedAt;

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = calculateCostUsd({
    model,
    tokensInUncached: inputTokens,
    tokensInCacheRead: 0,
    tokensInCacheWrite: 0,
    tokensOut: outputTokens,
  });

  // Extraer texto de la primera content block tipo text
  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
  if (text.length === 0) {
    throw new DescribeImageError('empty_response', 'Anthropic returned no text content', {
      model,
      mediaType,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd,
    });
  }

  return {
    text,
    inputTokens,
    outputTokens,
    costUsd,
    model,
    mediaType,
    latencyMs,
  };
}

async function downloadImage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ buffer: Uint8Array; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === 'AbortError';
    throw new DescribeImageError(
      aborted ? 'download_timeout' : 'download_failed',
      `failed to download ${url}: ${(err as Error).message}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new DescribeImageError('download_failed', `download ${url} returned HTTP ${res.status}`);
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new DescribeImageError(
      'file_too_large',
      `image ${buffer.byteLength} bytes exceeds limit ${maxBytes}`,
    );
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer, contentType };
}

function normalizeMediaType(contentType: string, url: string): string {
  // Trim charset etc.
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base.startsWith('image/')) return base;

  // Fallback por extensión
  const ext = (url.split(/[?#]/)[0] ?? '').toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.gif')) return 'image/gif';
  if (ext.endsWith('.webp')) return 'image/webp';
  return base || 'application/octet-stream';
}

function isSupportedMediaType(mediaType: string): boolean {
  return (
    mediaType === 'image/jpeg' ||
    mediaType === 'image/png' ||
    mediaType === 'image/gif' ||
    mediaType === 'image/webp'
  );
}
