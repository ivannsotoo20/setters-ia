import { DEFAULT_RULES } from './rules/index.js';
import type {
  RuleViolation,
  ValidateOptions,
  ValidationContext,
  ValidationResult,
  ValidationRule,
} from './types.js';

export type {
  Channel,
  RuleCheck,
  RuleViolation,
  ValidateOptions,
  ValidationContext,
  ValidationResult,
  ValidationRule,
} from './types.js';
export { DEFAULT_RULES } from './rules/index.js';
export * from './rules/index.js';
// Hito 12.1 — Heurística de tratamiento (tú/usted) usada por V18 y por el motor
// (mirror_lead inyecta directiva dinámica al system prompt según la detección).
export { detectAddressing, type AddressingResult } from './lib/detect-addressing.js';
// 2026-11-04 — Idioma de la persona (castellano, portugués, inglés, francés): el
// motor inyecta la directiva por turno y los seguimientos se escriben en su idioma.
export {
  detectLeadLanguage,
  resolveConversationLanguage,
  scoreLeadLanguage,
  LEAD_LANGUAGES,
  type LeadLanguage,
  type LeadLanguageDetection,
  // 2026-11-19 — detección ampliada (italiano, alemán) para los idiomas que no se atienden.
  detectSpokenLanguage,
  resolveSpokenLanguage,
  scoreSpokenLanguage,
  OTHER_LANGUAGES,
  SPOKEN_LANGUAGES,
  type OtherLanguage,
  type SpokenLanguage,
  type SpokenLanguageDetection,
} from './lib/detect-language.js';
// 2026-11-04 — Un solo signo de interrogación/exclamación (preferencia del trainer).
export {
  collapseRepeatedPunctuation,
  normalizePartsPunctuation,
  type PunctuationOptions,
} from './lib/normalize-punctuation.js';
// 2026-11-04 — Clave estable de un enlace (el mismo vídeo de YouTube en todas sus formas).
export { canonicalLinkKey, extractUrls, urlsAllowed, URL_IN_TEXT_RE } from './lib/link-key.js';
// 2026-10-21 (Tania) — apertura de conversación: palabra suelta, botón de una
// automatización o auto-respuesta en <2 min. La usan el panel (tarjeta de
// inbound) y el motor (gate de intención en la apertura, 2026-11-04).
export {
  AUTO_REPLY_WINDOW_MS,
  isBareKeywordOpening,
  isKeywordFlowOpening,
  normalizeOpening,
} from './lib/inbound-opening.js';

/**
 * Valida un mensaje del setter contra las reglas V0-V16.
 *
 * `text` es el mensaje COMPLETO post-Judge (antes del Splitter). Para validar
 * partes individuales del Splitter, llama a `validateMessage` por cada parte.
 *
 * No mutates ni reescribe — solo reporta. El caller decide si bloquear (errors)
 * o degradar (warns).
 */
export function validateMessage(
  text: string,
  ctx: ValidationContext,
  options: ValidateOptions = {},
): ValidationResult {
  const baseRules = options.rules ?? DEFAULT_RULES;
  const rules = filterRules(baseRules, options);

  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    if (rule.stub) continue;
    try {
      const v = rule.check(text, ctx);
      if (v) violations.push(v);
    } catch (err) {
      // Una regla rota no debe tirar el pipeline
      // eslint-disable-next-line no-console
      console.warn(`[validator] rule ${rule.id} threw:`, (err as Error).message);
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  return {
    ok: violations.length === 0,
    hasErrors,
    violations,
  };
}

function filterRules(rules: ValidationRule[], options: ValidateOptions): ValidationRule[] {
  let out = rules;
  if (options.only) {
    const set = new Set(options.only);
    out = out.filter((r) => set.has(r.id));
  }
  if (options.skip) {
    const set = new Set(options.skip);
    out = out.filter((r) => !set.has(r.id));
  }
  return out;
}
