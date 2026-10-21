/**
 * Precio que la entrenadora autoriza decir tal cual (2026-10-07, Tania).
 *
 * Tania: "Solo si vuelve a insistir expresamente con el precio, no quiero que
 * sigamos esquivando la pregunta", con su literal ("…puede estar entre 600 y
 * 1.200€…"). El cuándo y el cómo viven en su bloque de coach, y la CR2 del Core
 * lo permite solo para un literal que defina el coach. Aquí se lee el rango
 * exacto (`tenant_configs.lead_qualification.allowed_price_text`) para las dos
 * redes que quitaban cualquier cifra: el guardrail 2 del Judge y V11. Cualquier
 * otra cifra sigue siendo filtración.
 */

import type { ConversationMessage, PipelineInput } from '@fyzon/agent-pipeline';
import { matchesKeywordPattern } from '../services/ghl-message-router.js';

const MAX_PRICE_TEXT_CHARS = 80;
const MAX_FIRST_STEP_CHARS = 400;

export function parseAllowedPriceText(leadQualification: unknown): string | null {
  return readText(leadQualification, 'allowed_price_text', MAX_PRICE_TEXT_CHARS);
}

/**
 * D2 (2026-10-21) — la primera frase del precio, la que va sin cifra
 * (`lead_qualification.price_first_step_text`). Tania: «Claro, entiendo que el
 * precio sea importante para ti. Pero antes creo que lo más importante es saber si
 * realmente soy la persona adecuada para ayudarte.»
 */
export function parsePriceFirstStepText(leadQualification: unknown): string | null {
  return readText(leadQualification, 'price_first_step_text', MAX_FIRST_STEP_CHARS);
}

/**
 * D2: la cifra autorizada solo puede salir si en esta conversación ya salió la
 * primera frase. Con Elena (9 oct) la IA dio la cifra a la primera. Cuenta como
 * dada si aparece en lo que ha escrito la IA (junto, porque el Splitter puede
 * partirla en dos burbujas; el comparador es el de las palabras clave, que tolera
 * un emoji o una palabra cambiada) o si la persona ya había preguntado el precio
 * en un turno anterior: la regla de Tania es "solo si vuelve a insistir", y en la
 * batería del v30 el modelo a veces parafraseaba la primera frase. Sin precio
 * autorizado o sin primera frase configurada, no hay cerrojo (undefined).
 */
export function buildPriceGate(args: {
  leadQualification: unknown;
  history: ConversationMessage[];
}): PipelineInput['priceGate'] {
  const firstStepText = parsePriceFirstStepText(args.leadQualification);
  if (!firstStepText || !parseAllowedPriceText(args.leadQualification)) return undefined;
  const aiSoFar = args.history
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join(' ');
  return {
    firstStepText,
    firstStepDone: priceAskedAndAnswered(args.history) || matchesKeywordPattern(aiSoFar, firstStepText),
  };
}

/** ¿Preguntó el precio en un turno que la IA ya contestó? */
function priceAskedAndAnswered(history: ConversationMessage[]): boolean {
  let pending = false;
  for (const m of history) {
    if (m.role === 'user' && asksForPrice(m.content)) pending = true;
    else if (m.role === 'assistant' && pending) return true;
  }
  return false;
}

const PRICE_QUESTION_RE =
  /cu[aá]nto\s+(?:cuesta|cuestan|vale|valen|cobras|cobr[aá]is|sale|costar[ií]a|ser[ií]a)|precio|tarifa|cu[aá]nto\s+es\b/i;

/** ¿La persona pregunta el precio en este mensaje? */
export function asksForPrice(text: string): boolean {
  return PRICE_QUESTION_RE.test(text);
}

function readText(leadQualification: unknown, key: string, maxChars: number): string | null {
  if (!leadQualification || typeof leadQualification !== 'object' || Array.isArray(leadQualification)) {
    return null;
  }
  const raw = (leadQualification as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= maxChars ? text : null;
}
