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

import { resolveConversationLanguage, type LeadLanguage } from '@fyzon/shared-validator';

export type { LeadLanguage };

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
