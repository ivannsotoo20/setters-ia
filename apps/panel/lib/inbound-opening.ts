/**
 * ¿Una conversación que abrió la persona es un inbound de verdad o el flujo de
 * una palabra clave? (2026-10-21, Tania)
 *
 * Su definición: inbound es alguien que te escribe directamente con interés
 * real («Tengo una hernia y me gustaría saber cómo me puedes ayudar»). No lo es
 * quien escribe solo la palabra clave («espalda», «hernia»): eso es el flujo de
 * ManyChat, que le contesta con «Hola, por aquí Tânia…». Y la conversación que
 * abre ese mensaje tampoco lo es aunque después la persona conteste.
 *
 * Medido en el tenant 7 (14 días): de 651 aperturas de Facebook, 627 eran de
 * tres palabras o menos, casi todas un botón («Siii😊» 400, «Si» 71, «Empezar» /
 * «Get started» / «Démarrer»…). En Instagram, «espalda», «hérnia», «espaldaa».
 *
 * Es flujo de palabra clave si:
 *   - el primer mensaje de la persona, normalizado, es una palabra clave del
 *     tenant o la respuesta de un botón, sin nada más; o
 *   - un mensaje automático nuestro (`source='system'`) llega en los 2 minutos
 *     siguientes a ese primer mensaje: la automatización de la entrenadora lo
 *     contestó, aunque la palabra no esté en nuestra lista.
 * Se compara el mensaje entero, no si lo contiene: «hola! cervical también?» es
 * una pregunta suya aunque «cervical» sea palabra clave.
 */

/** Respuesta automática de la entrenadora (ManyChat) a una palabra clave: segundos. */
export const AUTO_REPLY_WINDOW_MS = 2 * 60 * 1000;

/** Hasta aquí, un mensaje puede ser "la palabra suelta"; más largo ya es suyo. */
const MAX_BARE_WORDS = 3;

/**
 * Respuestas de botón o de un "¿quieres que te lo cuente?" de una automatización.
 * "Empezar" y sus traducciones son el botón de inicio de Messenger. Se guardan
 * normalizadas, como se compara el mensaje ("démarrer" → "demarer").
 */
const BUTTON_REPLIES = new Set(
  [
    'si',
    'ok',
    'vale',
    'claro',
    'perfecto',
    'si por favor',
    'si gracias',
    'ok gracias',
    'empezar',
    'get started',
    'demarrer',
    'comecar',
    'inizia',
    'info',
    'informacion',
  ].map((b) => normalizeOpening(b)),
);

/**
 * Minúsculas, sin tildes, sin signos ni emojis, con las letras repetidas
 * colapsadas («Siii😊» → «si», «espaldaa» → «espalda», «Hérnia» → «hernia»).
 */
export function normalizeOpening(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(\p{L})\1+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El mensaje es solo una palabra clave o la respuesta de un botón? */
export function isBareKeywordOpening(text: string | null | undefined, keywordPatterns: readonly string[]): boolean {
  if (typeof text !== 'string') return false;
  const norm = normalizeOpening(text);
  if (norm.length === 0) return false;
  if (norm.split(' ').length > MAX_BARE_WORDS) return false;
  if (BUTTON_REPLIES.has(norm)) return true;
  return keywordPatterns.some((p) => {
    const k = normalizeOpening(p);
    return k.length > 0 && k === norm;
  });
}

export function isKeywordFlowOpening(input: {
  firstLeadText: string | null | undefined;
  firstLeadAt: string | null | undefined;
  /** Primer mensaje automático nuestro (`source='system'`) desde el primero de la persona. */
  firstAutoReplyAt: string | null | undefined;
  keywordPatterns: readonly string[];
}): boolean {
  if (isBareKeywordOpening(input.firstLeadText, input.keywordPatterns)) return true;
  const lead = input.firstLeadAt ? Date.parse(input.firstLeadAt) : NaN;
  const auto = input.firstAutoReplyAt ? Date.parse(input.firstAutoReplyAt) : NaN;
  return Number.isFinite(lead) && Number.isFinite(auto) && auto >= lead && auto - lead <= AUTO_REPLY_WINDOW_MS;
}
