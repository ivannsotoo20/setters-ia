/**
 * Enriquece mensajes media-only del lead transcribiendo audios + describiendo
 * imágenes ANTES de que el pipeline 3-LLM construya el `userMessage`.
 *
 * Bloque D — Multimodal IA (2026-05-08).
 *
 * Diseño:
 *   - Función pura, recibe deps (supabase + anthropic + groqApiKey).
 *   - Procesa rows del lead con `content IS NULL AND media_url IS NOT NULL`.
 *   - Para audio → Groq Whisper (si GROQ_API_KEY configurada). Sin key → skip
 *     con placeholder.
 *   - Para imagen → Claude vision (siempre — ANTHROPIC_API_KEY ya está).
 *   - UPDATE row poblando `transcription` (raw) + `content` (con prefijo
 *     legible para el pipeline).
 *   - Devuelve métricas agregadas (audio_seconds, image_count, cost_usd).
 *
 * Idempotencia: si una row ya tiene content poblado (ej, retry de turno previo),
 * se skipea automáticamente por el WHERE inicial.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import { describeImage, DescribeImageError } from '../lib/describe-image.js';
import {
  transcribeAudio,
  TranscribeAudioError,
  type AudioLanguage,
} from '../lib/transcribe-audio.js';

export interface EnrichMediaInput {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  conversationId: number;
  /** Idioma forzado por config del tenant ('es' / 'en' / 'auto'). */
  audioLanguage?: AudioLanguage;
  /** Groq API key (si vacía, audios se saltean con placeholder). */
  groqApiKey?: string;
  /** Override Groq API base. */
  groqApiBase?: string;
  /** Override Groq audio model. */
  groqAudioModel?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Máximo de rows a procesar en una sola llamada. Default 10. */
  limit?: number;
}

export interface EnrichMediaResult {
  audioSecondsTotal: number;
  imageCount: number;
  costUsd: number;
  /** Cuántos rows se procesaron exitosamente. */
  enrichedCount: number;
  /** Cuántos rows fallaron y quedaron con placeholder. */
  failedCount: number;
}

interface MediaRow {
  id: number;
  content_type: string;
  media_url: string;
}

export async function enrichMediaMessages(input: EnrichMediaInput): Promise<EnrichMediaResult> {
  const limit = input.limit ?? 10;
  const audioLanguage = input.audioLanguage ?? 'es';

  // 1. Cargar rows pendientes — solo del lead (source='lead'), con media_url
  //    pero content NULL/vacío. Solo del último bloque conversacional reciente
  //    (orden DESC por sent_at).
  const { data, error } = await input.supabase
    .from('conversation_messages')
    .select('id, content_type, media_url, content')
    .eq('conversation_id', input.conversationId)
    .eq('source', 'lead')
    .not('media_url', 'is', null)
    .is('content', null)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn(
      { conversationId: input.conversationId, err: error.message },
      'enrichMediaMessages: query failed',
    );
    return zeroResult();
  }
  if (!data || data.length === 0) return zeroResult();

  const rows: MediaRow[] = data
    .filter(
      (r): r is { id: number; content_type: string; media_url: string; content: null } =>
        typeof r.media_url === 'string' && r.media_url.length > 0,
    )
    .map((r) => ({ id: Number(r.id), content_type: String(r.content_type), media_url: r.media_url }));

  if (rows.length === 0) return zeroResult();

  let audioSecondsTotal = 0;
  let imageCount = 0;
  let costUsd = 0;
  let enrichedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    try {
      if (row.content_type === 'audio') {
        if (!input.groqApiKey) {
          await persistFallback(input.supabase, row.id, '[Audio recibido — transcripción no disponible (GROQ_API_KEY no configurada)]');
          failedCount += 1;
          continue;
        }
        const r = await transcribeAudio({
          url: row.media_url,
          language: audioLanguage,
          apiKey: input.groqApiKey,
          apiBase: input.groqApiBase,
          model: input.groqAudioModel,
          fetchImpl: input.fetchImpl,
        });
        const display = r.text.length > 0 ? `[Audio del lead]: ${r.text}` : '[Audio del lead — vacío o silencio]';
        await persistResult(input.supabase, row.id, display, r.text);
        audioSecondsTotal += r.durationSeconds;
        costUsd += r.costUsd;
        enrichedCount += 1;
        logger.info(
          {
            conversationId: input.conversationId,
            messageId: row.id,
            durationSeconds: r.durationSeconds,
            language: r.language,
            costUsd: r.costUsd,
          },
          'enrichMediaMessages: audio transcribed',
        );
      } else if (row.content_type === 'image') {
        const r = await describeImage({
          url: row.media_url,
          anthropic: input.anthropic,
          fetchImpl: input.fetchImpl,
        });
        const display = `[Imagen del lead]: ${r.text}`;
        await persistResult(input.supabase, row.id, display, r.text);
        imageCount += 1;
        costUsd += r.costUsd;
        enrichedCount += 1;
        logger.info(
          {
            conversationId: input.conversationId,
            messageId: row.id,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            costUsd: r.costUsd,
          },
          'enrichMediaMessages: image described',
        );
      } else {
        // video/file — sin handler todavía
        await persistFallback(
          input.supabase,
          row.id,
          `[${capitalize(row.content_type)} recibido — el motor IA no procesa ${row.content_type} todavía]`,
        );
        failedCount += 1;
      }
    } catch (err) {
      const reason =
        err instanceof TranscribeAudioError
          ? `audio_${err.reason}`
          : err instanceof DescribeImageError
            ? `image_${err.reason}`
            : 'unknown';
      logger.warn(
        {
          conversationId: input.conversationId,
          messageId: row.id,
          contentType: row.content_type,
          reason,
          err: (err as Error).message,
        },
        'enrichMediaMessages: enrich failed, persisting placeholder',
      );
      const placeholder =
        row.content_type === 'audio'
          ? '[Audio recibido — no se pudo transcribir]'
          : row.content_type === 'image'
            ? '[Imagen recibida — no se pudo procesar]'
            : `[${capitalize(row.content_type)} recibido — error]`;
      await persistFallback(input.supabase, row.id, placeholder).catch(() => undefined);
      failedCount += 1;
    }
  }

  return {
    audioSecondsTotal,
    imageCount,
    costUsd: Number(costUsd.toFixed(6)),
    enrichedCount,
    failedCount,
  };
}

async function persistResult(
  supabase: SupabaseClient,
  messageId: number,
  contentDisplay: string,
  rawTranscription: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_messages')
    .update({ content: contentDisplay, transcription: rawTranscription })
    .eq('id', messageId);
  if (error) {
    logger.warn(
      { messageId, err: error.message },
      'enrichMediaMessages: failed to persist result',
    );
  }
}

async function persistFallback(
  supabase: SupabaseClient,
  messageId: number,
  placeholder: string,
): Promise<void> {
  await supabase
    .from('conversation_messages')
    .update({ content: placeholder })
    .eq('id', messageId);
}

function zeroResult(): EnrichMediaResult {
  return {
    audioSecondsTotal: 0,
    imageCount: 0,
    costUsd: 0,
    enrichedCount: 0,
    failedCount: 0,
  };
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
