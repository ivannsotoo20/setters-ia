/**
 * Idioma de la persona → directiva por turno (2026-11-04, Tania: "la IA puede
 * continuar la conversación en el idioma en el que me escriba"; hace la
 * videollamada en castellano, portugués, inglés y francés).
 *
 * La detección vive en `@fyzon/shared-validator` (`detectLeadLanguage`). Aquí
 * se resuelve el idioma de la conversación (el último mensaje suyo que no sea
 * ambiguo) y se construye la directiva que va en `extraSystemSuffix`, fuera de
 * caché, igual que la de `mirror_lead`. En castellano no se inyecta nada.
 */

import {
  detectSpokenLanguage,
  resolveConversationLanguage,
  resolveSpokenLanguage,
  SPOKEN_LANGUAGES,
  type LeadLanguage,
  type SpokenLanguage,
} from '@fyzon/shared-validator';

export type { LeadLanguage, SpokenLanguage };

const LANGUAGE_NAME_ES: Record<LeadLanguage, string> = {
  es: 'castellano',
  pt: 'portugués',
  en: 'inglés',
  fr: 'francés',
};

/** Nombre del idioma en castellano, para directivas y logs. */
export function languageNameEs(lang: LeadLanguage): string {
  return LANGUAGE_NAME_ES[lang];
}

/** Idioma de la conversación a partir de lo que ha escrito la persona. */
export function resolveLeadLanguage(
  history: ReadonlyArray<{ role: string; content: string }>,
  userMessage: string,
): LeadLanguage {
  const leadMessages = history.filter((m) => m.role === 'user').map((m) => m.content);
  leadMessages.push(userMessage);
  return resolveConversationLanguage(leadMessages);
}

/**
 * Directiva markdown para el system prompt cuando la persona no escribe en
 * castellano. Los literales del bloque se dicen en su idioma con el mismo
 * sentido: la red de precio (D2) y la de zona siguen mirando el contenido
 * (cifras, enlaces, motivo), no el idioma.
 */
export function buildLeadLanguageDirective(lang: LeadLanguage): string | null {
  if (lang === 'es') return null;
  const name = LANGUAGE_NAME_ES[lang];
  return (
    '## Idioma de la persona (dato del motor)\n\n' +
    `Te escribe en **${name}**. Todo este turno va en ${name}: lo que dices, las preguntas y ` +
    'también los literales de tu bloque (el precio, la pregunta del país, los cierres, la oferta ' +
    'de un recurso), dichos en su idioma con el mismo sentido, sin añadir cifras ni motivos que el ' +
    'literal no tenga. Los enlaces se copian tal cual. Si vuelve al castellano, vuelves con ella.'
  );
}

// -----------------------------------------------------------------------------
// 2026-11-19 — Idiomas en los que atiende la entrenadora (Tania: "únicamente en
// español, portugués, inglés y francés. No quiero que converse en italiano. Si
// alguien escribe en otro idioma, que indique los idiomas disponibles y pregunte
// si puede continuar en alguno de ellos").
//
// Config: `tenant_configs.lead_qualification.languages`
//   { "allowed": ["es","pt","en","fr"], "unsupported_text": "…" }
// Sin esa clave, nada cambia (el modelo sigue el idioma de la persona como
// hasta ahora). Con ella:
//  - si la persona escribe en un idioma que no está en `allowed`, el motor manda
//    `unsupported_text` tal cual, sin pasar por el modelo (lo que dice ese texto
//    lo decide la entrenadora, no el modelo);
//  - si después sigue en ese idioma, la IA se pausa y se avisa a la entrenadora;
//  - y ningún turno del modelo sale en un idioma que no esté en `allowed`.
// -----------------------------------------------------------------------------

const SPOKEN_NAME_ES: Record<SpokenLanguage, string> = {
  es: 'castellano',
  pt: 'portugués',
  en: 'inglés',
  fr: 'francés',
  it: 'italiano',
  de: 'alemán',
};

export function spokenLanguageNameEs(lang: SpokenLanguage): string {
  return SPOKEN_NAME_ES[lang];
}

export interface LanguagePolicy {
  allowed: ReadonlySet<SpokenLanguage>;
  /** Lo que se manda a quien escribe en otro idioma. Una burbuja por párrafo. */
  unsupportedText: string;
}

const MAX_UNSUPPORTED_TEXT_CHARS = 600;

/** Texto por defecto si la config no trae uno: los idiomas, en castellano, y la pregunta. */
export function defaultUnsupportedText(allowed: ReadonlyArray<SpokenLanguage>): string {
  const names = allowed.map((l) => SPOKEN_NAME_ES[l]);
  const list =
    names.length <= 1 ? (names[0] ?? 'castellano') : `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}`;
  return `Perdona, por aquí solo puedo atenderte en ${list}. Podemos seguir en alguno de ellos?`;
}

/** Lee `lead_qualification.languages`. null si no está o no trae ningún idioma válido. */
export function parseLanguagePolicy(leadQualification: unknown): LanguagePolicy | null {
  if (!leadQualification || typeof leadQualification !== 'object') return null;
  const raw = (leadQualification as Record<string, unknown>).languages;
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Record<string, unknown>;
  if (!Array.isArray(cfg.allowed)) return null;
  const allowed = cfg.allowed
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter((v): v is SpokenLanguage => (SPOKEN_LANGUAGES as readonly string[]).includes(v));
  if (allowed.length === 0) return null;
  const text =
    typeof cfg.unsupported_text === 'string' && cfg.unsupported_text.trim()
      ? cfg.unsupported_text.trim().slice(0, MAX_UNSUPPORTED_TEXT_CHARS)
      : defaultUnsupportedText(allowed);
  return { allowed: new Set(allowed), unsupportedText: text };
}

/** El texto en burbujas: una por párrafo. */
export function unsupportedLanguageParts(policy: LanguagePolicy): string[] {
  return policy.unsupportedText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Idioma de la conversación entre los seis (para la política de idiomas). */
export function resolveSpokenLeadLanguage(
  history: ReadonlyArray<{ role: string; content: string }>,
  userMessage: string,
): SpokenLanguage {
  const leadMessages = history.filter((m) => m.role === 'user').map((m) => m.content);
  leadMessages.push(userMessage);
  return resolveSpokenLanguage(leadMessages);
}

/**
 * Qué hacer este turno con la política de idiomas: nada (`ok`), mandar el texto
 * de idiomas (`notice`), o pausar y avisar porque ya se le mandó y sigue en otro
 * idioma (`handoff`).
 */
export function decideLanguageTurn(args: {
  policy: LanguagePolicy | null;
  spokenLanguage: SpokenLanguage;
  history: ReadonlyArray<{ role: string; content: string }>;
}): 'ok' | 'notice' | 'handoff' {
  const { policy, spokenLanguage, history } = args;
  if (!policy || policy.allowed.has(spokenLanguage)) return 'ok';
  return hasSentUnsupportedNotice(history, policy) ? 'handoff' : 'notice';
}

/** ¿Ya le mandamos el texto de idiomas? (busca su primera burbuja en lo que dijo el setter). */
export function hasSentUnsupportedNotice(
  history: ReadonlyArray<{ role: string; content: string }>,
  policy: LanguagePolicy,
): boolean {
  const first = unsupportedLanguageParts(policy)[0];
  if (!first) return false;
  const needle = normalizeForMatch(first).slice(0, 60);
  return history.some((m) => m.role === 'assistant' && normalizeForMatch(m.content).includes(needle));
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * ¿El texto del turno va en un idioma que la entrenadora no atiende? Solo se
 * fía de una detección clara (`detectSpokenLanguage`); lo ambiguo pasa.
 */
export function outputInDisallowedLanguage(
  text: string,
  policy: LanguagePolicy | null,
): SpokenLanguage | null {
  if (!policy || typeof text !== 'string' || text.trim() === '') return null;
  const detected = detectSpokenLanguage(text);
  if (detected === 'ambiguous') return null;
  return policy.allowed.has(detected) ? null : detected;
}
