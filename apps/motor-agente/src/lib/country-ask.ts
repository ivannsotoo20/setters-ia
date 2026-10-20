/**
 * País a tiempo (2026-10-20, Tania): en Instagram o Messenger no hay prefijo de
 * teléfono y el país solo se sabe si ella lo dice. Su bloque pide preguntarlo al
 * principio, pero medido ese día solo 1 de 44 conversaciones de Instagram lo
 * preguntó en los dos primeros mensajes de la IA (de media, en el 10.º) y 15 no
 * lo preguntaron nunca. Con esto el motor decide cuándo toca y el pipeline (V23,
 * packages/agent-pipeline) le da un reintento al turno que no lo pregunta.
 *
 * Configuración en `tenant_configs.lead_qualification.call_gate` (va con el
 * cerrojo de la videollamada porque es su dato):
 *   - con `require_country: true`, se activa por defecto en el turno 2 de la IA;
 *   - `ask_country_by_turn`: otro turno (1-5), o 0 para apagarlo;
 *   - `ask_country_question`: la frase de la entrenadora, opcional.
 */

import { asksForCountry, type ConversationMessage, type PipelineInput } from '@fyzon/agent-pipeline';
import type { ZoneVerdict } from './zone-policy.js';

export interface CountryAskConfig {
  byTurn: number;
  question: string | null;
}

const DEFAULT_BY_TURN = 2;
const NO_PHONE_CHANNELS = new Set(['instagram_dm', 'facebook_messenger']);

export function parseCountryAskConfig(leadQualification: unknown): CountryAskConfig | null {
  if (!leadQualification || typeof leadQualification !== 'object' || Array.isArray(leadQualification)) {
    return null;
  }
  const raw = (leadQualification as Record<string, unknown>).call_gate;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  const turn = cfg.ask_country_by_turn;
  let byTurn: number | null = null;
  if (typeof turn === 'number' && Number.isInteger(turn)) {
    if (turn <= 0) return null;
    byTurn = Math.min(turn, 5);
  } else if (cfg.require_country === true) {
    byTurn = DEFAULT_BY_TURN;
  }
  if (byTurn == null) return null;
  const q = cfg.ask_country_question;
  const question = typeof q === 'string' && q.trim().length > 0 ? q.trim().slice(0, 240) : null;
  return { byTurn, question };
}

/**
 * Turno de la IA que se va a generar (1 = el primero). Cada tanda seguida de
 * mensajes nuestros es un turno; si la conversación la abrimos nosotros (la
 * bienvenida o la palabra clave de la entrenadora, o la plantilla de WhatsApp),
 * esa apertura no cuenta como turno de la IA.
 */
export function nextAiTurn(history: ConversationMessage[]): number {
  let runs = 0;
  let prev: ConversationMessage['role'] | null = null;
  for (const m of history) {
    if (m.role === 'assistant' && prev !== 'assistant') runs += 1;
    prev = m.role;
  }
  const openedByUs = history.length > 0 && history[0]!.role === 'assistant';
  return Math.max(0, runs - (openedByUs ? 1 : 0)) + 1;
}

/**
 * El encargo de V23 para este turno, o undefined si no toca: solo en canales sin
 * teléfono, con el país sin decidir por el motor, desde el turno configurado y si
 * ningún mensaje nuestro anterior lo ha preguntado ya.
 */
export function buildCountryAsk(args: {
  leadQualification: unknown;
  channel: string | null | undefined;
  zoneVerdict: ZoneVerdict;
  history: ConversationMessage[];
}): PipelineInput['countryAsk'] {
  const cfg = parseCountryAskConfig(args.leadQualification);
  if (!cfg) return undefined;
  if (!args.channel || !NO_PHONE_CHANNELS.has(args.channel)) return undefined;
  // Con un veredicto de zona el país ya está decidido (prefijo o declaración).
  if (args.zoneVerdict.kind !== 'clear' && args.zoneVerdict.kind !== 'mention') return undefined;
  const turn = nextAiTurn(args.history);
  if (turn < cfg.byTurn) return undefined;
  const askedBefore = args.history.some((m) => m.role === 'assistant' && asksForCountry(m.content));
  if (askedBefore) return undefined;
  return { turn, question: cfg.question };
}

/**
 * Lo que el setter tiene que saber en la directiva runtime cuando toca: que este
 * turno pregunta desde dónde escribe, salvo que ella ya lo haya dicho.
 */
export function renderCountryAskBlock(ask: PipelineInput['countryAsk']): string | null {
  if (!ask) return null;
  const phrase = ask.question
    ? `con esta frase: «${ask.question}»`
    : 'con la frase de tu bloque para preguntarlo';
  return (
    '## Desde dónde te escribe (país a tiempo)\n\n' +
    'Esta conversación no trae prefijo de teléfono y todavía no sabes desde dónde te escribe. ' +
    `Este turno termina preguntándolo, ${phrase}, y esa es la única pregunta del turno. Si ella ` +
    'ya te ha dicho dónde vive, no lo preguntes: decláralo en lead_country_iso.'
  );
}
