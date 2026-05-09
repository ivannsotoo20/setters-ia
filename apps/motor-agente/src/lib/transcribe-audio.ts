/**
 * Groq Whisper transcripción de audios inbound (Bloque D, 2026-05-08).
 *
 * Endpoint: POST {GROQ_API_BASE}/audio/transcriptions
 * Modelo: whisper-large-v3-turbo (mismo que OpenAI Whisper, corriendo en
 * hardware Groq → 5-10× más rápido + ~9× más barato).
 *
 * Coste: ~$0.04/hora de audio (≈ 0.07¢/min).
 *
 * Flujo:
 *   1. GET el media_url → buffer (timeout 30s).
 *   2. POST multipart con file=<buffer> + model + language + response_format.
 *   3. Parse `{ text, language, duration }`.
 *   4. Devuelve { text, language, durationSeconds, costUsd, model }.
 *
 * Errores: throw `TranscribeAudioError` con `reason` clasificado.
 * No retry automático — el caller decide.
 */

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // Groq limit
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;

/** $/hora para whisper-large-v3-turbo según pricing público Groq 2026-05. */
const PRICE_USD_PER_HOUR = 0.04;

export type AudioLanguage = 'es' | 'en' | 'auto';

export interface TranscribeAudioInput {
  /** URL HTTP/S del audio (CDN GHL típicamente). */
  url: string;
  /** Forzar idioma o 'auto'. Default 'auto'. */
  language?: AudioLanguage;
  /** API key Groq. Si vacía → throw `missing_api_key`. */
  apiKey: string;
  /** Override base URL Groq (default https://api.groq.com/openai/v1). */
  apiBase?: string;
  /** Override modelo (default whisper-large-v3-turbo). */
  model?: string;
  /** Bytes máximos a aceptar al descargar. Default 25MB. */
  maxBytes?: number;
  /** Timeout descarga en ms. Default 30000. */
  downloadTimeoutMs?: number;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

export interface TranscribeAudioResult {
  /** Texto transcrito. Puede estar vacío si el audio está en silencio. */
  text: string;
  /** Idioma detectado o forzado. */
  language: string;
  /** Duración del audio en segundos (Groq lo devuelve con verbose_json). */
  durationSeconds: number;
  /** Coste calculado en USD. */
  costUsd: number;
  /** Modelo usado. */
  model: string;
}

export type TranscribeAudioErrorReason =
  | 'missing_api_key'
  | 'download_failed'
  | 'download_timeout'
  | 'file_too_large'
  | 'groq_http_error'
  | 'groq_invalid_response';

export class TranscribeAudioError extends Error {
  readonly reason: TranscribeAudioErrorReason;
  readonly status?: number;
  readonly bodySnippet?: string;
  constructor(
    reason: TranscribeAudioErrorReason,
    message: string,
    opts?: { status?: number; bodySnippet?: string },
  ) {
    super(message);
    this.name = 'TranscribeAudioError';
    this.reason = reason;
    this.status = opts?.status;
    this.bodySnippet = opts?.bodySnippet;
  }
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  if (!input.apiKey) {
    throw new TranscribeAudioError('missing_api_key', 'GROQ_API_KEY not configured');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const apiBase = input.apiBase ?? 'https://api.groq.com/openai/v1';
  const model = input.model ?? 'whisper-large-v3-turbo';
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const language = input.language ?? 'auto';

  // 1. Descargar audio
  const audioBuffer = await downloadBuffer(
    input.url,
    fetchImpl,
    input.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    maxBytes,
  );

  // 2. POST multipart a Groq
  const filename = inferFilename(input.url);
  const form = new FormData();
  form.append('file', new Blob([audioBuffer]), filename);
  form.append('model', model);
  form.append('response_format', 'verbose_json'); // incluye duration + language
  if (language !== 'auto') {
    form.append('language', language);
  }

  const url = `${apiBase}/audio/transcriptions`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new TranscribeAudioError(
      'groq_http_error',
      `Groq transcription failed: HTTP ${res.status}`,
      { status: res.status, bodySnippet: text.slice(0, 400) },
    );
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TranscribeAudioError(
      'groq_invalid_response',
      'Groq response not valid JSON',
      { bodySnippet: text.slice(0, 200) },
    );
  }

  const transcribed = typeof json.text === 'string' ? json.text : '';
  const detectedLanguage = typeof json.language === 'string' ? json.language : language;
  const duration = typeof json.duration === 'number' ? json.duration : 0;
  const costUsd = (duration / 3600) * PRICE_USD_PER_HOUR;

  return {
    text: transcribed.trim(),
    language: detectedLanguage,
    durationSeconds: duration,
    costUsd,
    model,
  };
}

async function downloadBuffer(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === 'AbortError';
    throw new TranscribeAudioError(
      aborted ? 'download_timeout' : 'download_failed',
      `failed to download ${url}: ${(err as Error).message}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new TranscribeAudioError(
      'download_failed',
      `download ${url} returned HTTP ${res.status}`,
      { status: res.status },
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new TranscribeAudioError(
      'file_too_large',
      `audio file ${buf.byteLength} bytes exceeds limit ${maxBytes}`,
    );
  }
  return buf;
}

function inferFilename(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const last = path.split('/').filter(Boolean).pop();
    if (last && last.includes('.')) return last;
  } catch {
    // ignore
  }
  return 'audio.bin';
}
