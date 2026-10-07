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

const MAX_PRICE_TEXT_CHARS = 80;

export function parseAllowedPriceText(leadQualification: unknown): string | null {
  if (!leadQualification || typeof leadQualification !== 'object' || Array.isArray(leadQualification)) {
    return null;
  }
  const raw = (leadQualification as Record<string, unknown>).allowed_price_text;
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= MAX_PRICE_TEXT_CHARS ? text : null;
}
