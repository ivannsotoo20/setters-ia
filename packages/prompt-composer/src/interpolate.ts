import type { TrainerContext } from './types.js';

/**
 * Sprint Gamma 2.6 — Interpolación de placeholders del trainer en bloques shared.
 *
 * Sintaxis: `{{trainer_phone|fallback text}}` o `{{trainer_phone}}`.
 * - Si `ctx.phone` no es null/empty → se reemplaza con `ctx.phone`.
 * - Si `ctx.phone` es null → se reemplaza con `fallback text` (lo que sigue al `|`).
 * - Si no hay `|fallback` y phone es null → se reemplaza con string vacío
 *   (degradación segura, NUNCA dejamos `{{...}}` literal en el prompt).
 *
 * Función pura: el caller decide a qué bloques aplicarla. Sprint 2.6 la aplica
 * solo a `handoff_v4` para evitar reemplazos no intencionados en otros bloques.
 *
 * Diseño defensivo:
 * - `ctx` opcional: si se omite, todos los placeholders caen al fallback.
 * - Si llega `phone` con espacios alrededor, lo trimmea antes de inyectar.
 * - Match no-greedy para soportar múltiples placeholders en el mismo texto.
 */
export function interpolateTrainerPlaceholders(
  text: string,
  ctx?: TrainerContext,
): string {
  const phone = ctx?.phone?.trim() || null;
  return text.replace(/\{\{trainer_phone(?:\|([^}]*))?\}\}/g, (_, fallback) => {
    if (phone) return phone;
    return fallback ?? '';
  });
}
