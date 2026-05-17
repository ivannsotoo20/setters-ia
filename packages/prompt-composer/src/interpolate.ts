import type { TrainerContext } from './types.js';

/**
 * Sprint Gamma 2.6 — Interpolación de placeholders del trainer en bloques shared.
 *
 * Sintaxis soportada:
 *   - `{{trainer_phone|fallback text}}` / `{{trainer_phone}}` (Sprint 2.6)
 *   - `{{handoff_directive}}` (Sprint 2.6b — placeholder rich, renderiza un bloque
 *     markdown completo según `ctx.handoff`)
 *
 * Diseño defensivo:
 * - `ctx` opcional: si se omite, todos los placeholders caen a fallback legacy.
 * - Si phone llega con espacios alrededor, se trimea antes de inyectar.
 * - Match no-greedy para múltiples placeholders en el mismo texto.
 */
export function interpolateTrainerPlaceholders(
  text: string,
  ctx?: TrainerContext,
): string {
  const phone = ctx?.phone?.trim() || null;
  const trackedUrl = ctx?.trackedCalendarUrl?.trim() || null;
  const slotsBlock = ctx?.availableSlotsBlock?.trim() || null;
  return text
    .replace(/\{\{trainer_phone(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (phone) return phone;
      return fallback ?? '';
    })
    .replace(/\{\{tracked_calendar_url(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (trackedUrl) return trackedUrl;
      return fallback ?? '';
    })
    .replace(/\{\{available_slots(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (slotsBlock) return slotsBlock;
      return fallback ?? '';
    })
    .replace(/\{\{handoff_directive\}\}/g, () => renderHandoffDirective(ctx));
}

/**
 * Plantillas preset hardcoded de cierre custom (Sprint 2.6b).
 * Si en producción se observa que alguna plantilla envejece, basta editar aquí
 * — no requiere migration ni cambio de schema.
 */
const HANDOFF_TEMPLATE_TEXTS: Record<'warm' | 'professional', string> = {
  warm: 'Te paso con mi equipo personalmente — alguien te escribirá en cuanto pueda 🙏 gracias por tu paciencia.',
  professional:
    'Cierro la conversación aquí. Mi equipo recibirá tu mensaje y te responderá lo antes posible.',
};

/**
 * Renderiza la directiva markdown del bloque "Comportamiento en Causa B" según
 * el contexto del trainer. Llamado desde `interpolateTrainerPlaceholders` cuando
 * encuentra `{{handoff_directive}}`.
 *
 * Modos:
 * - Si `ctx.handoff.enabled = false` o `ctx` no presente: legacy (Sprint 2.6 v2)
 *   — comparte phone si lo hay, sino frase genérica.
 * - `share_phone`: comparte phone con reglas. Si phone null → degrada a silent.
 * - `silent`: NO comparte canal alguno, frase de cierre genérica.
 * - `custom_message` + template warm/professional: usa la plantilla preset.
 * - `custom_message` + template free + `customMessage` set: usa el texto libre.
 * - `custom_message` + template free + `customMessage` null: degrada a warm preset.
 */
export function renderHandoffDirective(ctx?: TrainerContext): string {
  const phone = ctx?.phone?.trim() || null;

  // Modo legacy (compat Sprint 2.6 v2)
  if (!ctx?.handoff?.enabled) {
    if (phone) {
      return (
        `Comparte el teléfono **${phone}** una sola vez con frase tipo "puedes escribirles directamente al [número]". ` +
        `NUNCA repitas el número en la misma conversación. NUNCA inventes otros canales (email, redes, web). ` +
        `NUNCA llames "trainer" o "entrenador" al humano del handoff (usa "el equipo", "alguien del equipo").`
      );
    }
    return (
      `NO ofrezcas ningún canal al lead. Di una frase tipo "el equipo te contactará en breve, no es necesario que hagas nada más". ` +
      `Una sola frase, cierre educado. NUNCA inventes números, emails ni canales.`
    );
  }

  // Modo personalizado
  switch (ctx.handoff.mode) {
    case 'share_phone': {
      if (phone) {
        return (
          `Comparte el teléfono **${phone}** una sola vez con frase tipo "puedes escribirles directamente al [número]". ` +
          `NUNCA repitas el número en la misma conversación. NUNCA inventes otros canales (email, redes, web). ` +
          `NUNCA llames "trainer" o "entrenador" al humano del handoff (usa "el equipo", "alguien del equipo").`
        );
      }
      // Degrada a silent automático cuando phone null pero modo elegido era share_phone
      return (
        `(El trainer eligió "compartir teléfono" pero NO lo tiene configurado: degrada a silencioso). ` +
        `NO ofrezcas ningún canal al lead. Di "el equipo te contactará en breve, no es necesario que hagas nada más".`
      );
    }
    case 'silent':
      return (
        `NO ofrezcas ningún canal al lead. Cierra la conversación con una frase tipo "el equipo te contactará en breve, ` +
        `no es necesario que hagas nada más". Una sola frase, cierre educado. NUNCA inventes números, emails ni canales. ` +
        `El trainer atenderá manualmente tras recibir email.`
      );
    case 'custom_message': {
      const templateText =
        ctx.handoff.template === 'free'
          ? ctx.handoff.customMessage?.trim() || HANDOFF_TEMPLATE_TEXTS.warm
          : HANDOFF_TEMPLATE_TEXTS[ctx.handoff.template];
      return (
        `Di EXACTAMENTE esta frase del trainer (puedes adaptar mínimamente para que encaje con el tono de la conversación, ` +
        `pero respeta el sentido y la intención): "${templateText}". NO añadas canales, números ni links que el trainer no haya mencionado.`
      );
    }
  }
}
