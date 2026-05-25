/**
 * Hito 12.2 Fase B (2026-05-20) — Orquesta inferencia nombre + género en F0.
 *
 * Flujo:
 *   1. detect-name (heurística sync). Si 'not_usable' → opcional Haiku
 *      (puede recuperar "Andrea" de "andrea12345").
 *   2. Si name.status='usable', detect-gender sobre el primer nombre detectado.
 *      Heurística primero (diccionario); 'unknown' → opcional Haiku.
 *   3. Persistir en `leads.parsed_name`, `leads.parsed_name_status`,
 *      `leads.detected_gender`, `leads.name_gender_detected_at`.
 *
 * Idempotencia: si el lead ya tiene `name_gender_detected_at` reciente (< 24h)
 * Y `parsed_name_status='usable'`, se salta toda la inferencia. Si tenía
 * 'unknown'/'not_usable', se re-evalúa (el lead puede haber enriquecido sus
 * datos en el upsert posterior).
 *
 * Fail-safe: cualquier excepción se loggea pero NO se propaga — la inferencia
 * es best-effort, no debe romper el flujo de ingest del webhook.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { detectLeadName, type DetectLeadNameInput } from '../lib/detect-name.js';
import { detectGender } from '../lib/detect-gender.js';
import { getAnthropic } from '../lib/anthropic.js';
import { logger } from '../lib/logger.js';

/** TTL para skip-detect cuando ya hay un resultado 'usable' reciente. */
const SKIP_DETECT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RunLeadInferenceParams {
  supabase: SupabaseClient;
  leadId: number;
  /** Datos brutos del lead tal como llegan del webhook canal. */
  raw: DetectLeadNameInput;
  /** Inyectable para tests. Default: getAnthropic(). Pass null para forzar skip Haiku. */
  anthropic?: Anthropic | null;
}

export interface LeadInferenceOutcome {
  /** True si se ejecutó la inferencia (BD actualizada o intentado). False si se saltó por TTL. */
  executed: boolean;
  parsedName: string | null;
  parsedNameStatus: 'usable' | 'not_usable' | 'unknown' | null;
  detectedGender: 'male' | 'female' | 'ambiguous' | 'unknown' | null;
}

/**
 * Ejecuta detección + persistencia. Devuelve outcome para logging/tests.
 * NUNCA tira — si algo falla, devuelve outcome parcial.
 */
export async function runLeadInference(
  params: RunLeadInferenceParams,
): Promise<LeadInferenceOutcome> {
  const { supabase, leadId, raw } = params;
  // anthropic === null en tests para skip LLM explícito; undefined → usa getAnthropic
  const anthropic =
    params.anthropic === null ? undefined : (params.anthropic ?? safeGetAnthropic());

  // 1. Skip si ya hay inferencia 'usable' reciente.
  try {
    const { data: existing, error } = await supabase
      .from('leads')
      .select('parsed_name_status, name_gender_detected_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!error && existing) {
      const row = existing as {
        parsed_name_status?: string | null;
        name_gender_detected_at?: string | null;
      };
      if (
        row.parsed_name_status === 'usable' &&
        row.name_gender_detected_at &&
        Date.now() - new Date(row.name_gender_detected_at).getTime() < SKIP_DETECT_WINDOW_MS
      ) {
        return {
          executed: false,
          parsedName: null,
          parsedNameStatus: 'usable',
          detectedGender: null,
        };
      }
    }
  } catch (err) {
    // Silencioso — el SELECT pre-check no es crítico; seguimos con la detección.
    logger.warn({ err, leadId }, 'lead-inference pre-check failed (continuing)');
  }

  // 2. Detectar nombre.
  let nameResult;
  try {
    nameResult = await detectLeadName(raw, anthropic);
  } catch (err) {
    logger.warn({ err, leadId }, 'detect-name failed; falling back to unknown');
    nameResult = { name: null, status: 'unknown' as const, source: 'heuristic' as const };
  }

  // 3. Detectar género (solo si tenemos nombre usable).
  let genderResult: { gender: 'male' | 'female' | 'ambiguous' | 'unknown' } = {
    gender: 'unknown',
  };
  if (nameResult.status === 'usable' && nameResult.name) {
    try {
      genderResult = await detectGender(nameResult.name, anthropic);
    } catch (err) {
      logger.warn({ err, leadId }, 'detect-gender failed; falling back to unknown');
      genderResult = { gender: 'unknown' };
    }
  }

  // 4. Persistir.
  try {
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        parsed_name: nameResult.status === 'usable' ? nameResult.name : null,
        parsed_name_status: nameResult.status,
        detected_gender: genderResult.gender,
        name_gender_detected_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (updateError) {
      logger.warn(
        { err: updateError.message, leadId },
        'lead-inference UPDATE failed; outcome may not persist',
      );
    }
  } catch (err) {
    logger.warn({ err, leadId }, 'lead-inference UPDATE threw');
  }

  return {
    executed: true,
    parsedName: nameResult.name,
    parsedNameStatus: nameResult.status,
    detectedGender: genderResult.gender,
  };
}

/**
 * Wrapper defensivo alrededor de `getAnthropic()`. Si ANTHROPIC_API_KEY no
 * está configurada en `env`, getAnthropic throws — atrapamos y devolvemos
 * undefined para que la inferencia caiga a heurística-only.
 */
function safeGetAnthropic(): Anthropic | undefined {
  try {
    return getAnthropic();
  } catch {
    return undefined;
  }
}
