/**
 * Palabras clave de automatización (`automation_keywords`): carga y casado.
 *
 * Vivía dentro de `ghl-message-router.ts`. Se separó el 2026-11-04 porque el
 * gate de intención en la apertura (`inbound-intent-gate.ts`) las necesita y el
 * router lo llama a él: sin este módulo propio habría un import circular. El
 * router las re-exporta, así que los importadores de siempre no cambian.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';

// ============================================================================
// loadAutomationKeywords
// ============================================================================

export interface AutomationKeywordRow {
  type: 'bienvenida' | 'lm' | 'inbound' | 'wa_open';
  pattern: string;
}

export async function loadAutomationKeywords(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<AutomationKeywordRow[]> {
  const { data, error } = await supabase
    .from('automation_keywords')
    .select('type, pattern')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) {
    logger.warn({ tenantId, err: error.message }, 'loadAutomationKeywords failed');
    return [];
  }
  if (!data) return [];
  return data
    .filter(
      (r): r is AutomationKeywordRow =>
        (r.type === 'bienvenida' ||
          r.type === 'lm' ||
          r.type === 'inbound' ||
          r.type === 'wa_open') &&
        typeof r.pattern === 'string' &&
        r.pattern.length > 0,
    )
    .map((r) => ({ type: r.type, pattern: r.pattern }));
}

// ============================================================================
// classifyByKeywords (pure, exported for tests)
// ============================================================================

/**
 * Devuelve el primer tipo cuyo `pattern` aparece dentro del `body` (ver
 * `matchesKeywordPattern`). Replica el comportamiento del flow legacy
 * `System - GHL - Bienvenidas a mano` switch.
 */
export function classifyByKeywords(
  body: string,
  keywords: AutomationKeywordRow[],
): 'bienvenida' | 'lm' | 'inbound' | null {
  return matchKeyword(body, keywords)?.type ?? null;
}

/**
 * Igual que `classifyByKeywords` pero devuelve TAMBIÉN el patrón que casó.
 *
 * Hace falta para el etiquetado en GHL: con un lead magnet no basta saber que
 * vino de un recurso, interesa de CUÁL, y eso solo lo sabe la keyword concreta.
 */
export function matchKeyword(
  body: string,
  keywords: AutomationKeywordRow[],
): { type: 'bienvenida' | 'lm' | 'inbound'; pattern: string } | null {
  if (!body || typeof body !== 'string') return null;
  const prepared = prepareBody(body);
  // Ordering: bienvenida > lm > inbound (mismo orden que el switch legacy).
  // wa_open NO entra aquí — solo lo usa el gate WA en webhook-ycloud.
  for (const type of ['bienvenida', 'lm', 'inbound'] as const) {
    const matches = keywords.filter((k) => k.type === type);
    for (const k of matches) {
      if (patternMatches(prepared, k.pattern)) {
        return { type, pattern: k.pattern };
      }
    }
  }
  return null;
}

/**
 * Devuelve true si `body` contiene alguna de las keywords (ver
 * `matchesKeywordPattern`). Usada por el gate WA inbound (`webhook-ycloud.ts`)
 * cuando `wa_inbound_mode='keyword'`. Las keywords ya vienen pre-filtradas por
 * type (típicamente `'wa_open'`).
 */
export function matchesAnyKeyword(body: string, keywords: AutomationKeywordRow[]): boolean {
  if (!body || typeof body !== 'string' || keywords.length === 0) return false;
  const prepared = prepareBody(body);
  return keywords.some((k) => patternMatches(prepared, k.pattern));
}

/**
 * Devuelve 'inbound' si `body` matchea con alguna keyword type='inbound'
 * registrada para el tenant. Usada por el gate classified_only en
 * `routeGhlInbound` y `webhook-manychat` para reconocer leads orgánicos que
 * llegan directamente con palabras clave del trainer (ej. "info", "programa",
 * "precio"). Resultado: conv clasificada como 'inbound' + IA activa sin
 * intervención humana.
 */
export function classifyInboundOnly(
  body: string,
  keywords: AutomationKeywordRow[],
): 'inbound' | null {
  const inboundKeywords = keywords.filter((k) => k.type === 'inbound');
  if (inboundKeywords.length === 0) return null;
  return matchesAnyKeyword(body, inboundKeywords) ? 'inbound' : null;
}

/**
 * Cómo casa una palabra clave con un mensaje. Dos pasadas:
 *
 * 1. Trozo literal: minúsculas, sin acentos ni espacios; emojis y signos cuentan.
 *    Es la regla de siempre más los acentos, que el panel ya prometía ("ni cuidar
 *    mayúsculas o acentos de más") y el código no hacía: la palabra clave
 *    «Información» no casaba con quien escribe "informacion".
 *
 * 2. Frase (2026-10-07), solo para palabras clave de 4 palabras o más: sus
 *    palabras en orden, sin mirar emojis, signos ni letras alargadas ("Holaaa"),
 *    con hasta 2 palabras de más por medio (3 desde 6 palabras: el nombre de la
 *    persona) y, desde 6 palabras, una que falte o cambie. Caso real: Tania guardó
 *    sus bienvenidas enteras, con su emoji («Hola, te doy la bienvenida a esta
 *    comunidad 🎉»); escritas con el nombre delante o con otro emoji no casaban,
 *    así que no se contaban y la conversación no nacía como bienvenida.
 *
 * Una palabra clave corta no pasa por la 2: «Hola! 👋» sin su emoji sería "hola",
 * y casaría con cualquier mensaje a mano de la entrenadora, que tiene que pausar
 * la IA (Caso D de `routeGhlOutbound`).
 */
export function matchesKeywordPattern(body: string, pattern: string): boolean {
  if (!body || typeof body !== 'string' || typeof pattern !== 'string') return false;
  return patternMatches(prepareBody(body), pattern);
}

export function normalizeForMatch(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/\s+/g, '');
}

const PHRASE_MIN_WORDS = 4;

interface PreparedBody {
  squashed: string;
  words: string[];
}

function prepareBody(body: string): PreparedBody {
  return { squashed: normalizeForMatch(body), words: phraseWords(body) };
}

function patternMatches(body: PreparedBody, pattern: string): boolean {
  const squashedPattern = normalizeForMatch(pattern);
  if (squashedPattern.length === 0) return false;
  if (body.squashed.includes(squashedPattern)) return true;
  const words = phraseWords(pattern);
  return words.length >= PHRASE_MIN_WORDS && containsPhrase(body.words, words);
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Palabras (letras y números) en minúscula, sin acentos y sin letras repetidas seguidas. */
function phraseWords(s: string): string[] {
  return stripAccents(s.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/(\p{L})\1+/gu, '$1'));
}

/**
 * ¿Aparecen las palabras de `phrase` en orden dentro de `words`, con como mucho
 * `maxInserted` palabras ajenas por medio y `maxMissing` de la frase sin
 * aparecer? Para cada inicio posible se alarga la ventana palabra a palabra
 * llevando la subsecuencia común más larga (LCS) entre la frase y la ventana.
 */
function containsPhrase(words: string[], phrase: string[]): boolean {
  const n = phrase.length;
  const maxInserted = n >= 6 ? 3 : 2;
  const maxMissing = n >= 6 ? Math.max(1, Math.floor(n / 7)) : 0;
  const needed = n - maxMissing;
  const maxWindow = n + maxInserted;
  for (let start = 0; start + needed <= words.length; start++) {
    let prev = new Array<number>(n + 1).fill(0);
    const end = Math.min(words.length, start + maxWindow);
    for (let j = start; j < end; j++) {
      const cur = new Array<number>(n + 1).fill(0);
      for (let i = 1; i <= n; i++) {
        cur[i] =
          phrase[i - 1] === words[j] ? prev[i - 1]! + 1 : Math.max(prev[i]!, cur[i - 1]!);
      }
      const common = cur[n]!;
      if (common >= needed && j - start + 1 - common <= maxInserted) return true;
      prev = cur;
    }
  }
  return false;
}

