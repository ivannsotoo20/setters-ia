import type { LeadInferenceContext, TrainerContext } from './types.js';

/**
 * Hito 12.2 — Modos de uso del nombre del lead (espejo del schema en panel).
 * Duplicado intencionado: el composer no importa del panel ni del motor para
 * evitar dependencias circulares.
 */
export type UseLeadNameMode = 'auto' | 'always' | 'never';

/**
 * Hito 12.2 — Género objetivo del trainer (espejo del schema en panel).
 */
export type TargetClientGender = 'mixed' | 'male' | 'female';

/**
 * Hito 12.2 — Estilo de la pregunta de verificación cuando hay mismatch
 * (espejo del schema en panel).
 */
export type GenderVerificationStyle = 'soft' | 'direct';

/**
 * Cerebro v5 — Interpolación de placeholders rich en bloques shared/tenant.
 *
 * Sintaxis soportada:
 *   - `{{trainer_phone|fallback text}}` / `{{trainer_phone}}`
 *   - `{{tracked_calendar_url|fallback}}`
 *   - `{{available_slots|fallback}}`
 *   - `{{current_date|fallback}}`
 *   - `{{lead_contact_status|fallback}}`
 *   - `{{lead_timezone_label|fallback}}`
 *   - `{{trainer_timezone_label|fallback}}`
 *   - `{{handoff_directive}}` (placeholder rich — renderiza markdown según ctx.handoff)
 *   - `{{current_phase_focus|fallback}}` (Cerebro v5 — instrucción focal por turno)
 *
 * Diseño defensivo:
 * - `ctx` opcional: si se omite, todos los placeholders caen a fallback.
 * - Trim de valores con espacios alrededor antes de inyectar.
 * - Match no-greedy para múltiples placeholders en el mismo texto.
 */
export function interpolateTrainerPlaceholders(
  text: string,
  ctx?: TrainerContext,
): string {
  const phone = ctx?.phone?.trim() || null;
  const trackedUrl = ctx?.trackedCalendarUrl?.trim() || null;
  const slotsBlock = ctx?.availableSlotsBlock?.trim() || null;
  const currentDateLabel = ctx?.currentDateLabel?.trim() || null;
  const leadContactBlock = ctx?.leadContactStatusBlock?.trim() || null;
  const leadTzLabel = ctx?.leadTimezoneLabel?.trim() || null;
  const trainerTzLabel = ctx?.trainerTimezoneLabel?.trim() || null;
  const phaseFocus = ctx?.currentPhaseFocus?.trim() || null;
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
    .replace(/\{\{current_date(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (currentDateLabel) return currentDateLabel;
      return fallback ?? '';
    })
    .replace(/\{\{lead_contact_status(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (leadContactBlock) return leadContactBlock;
      return fallback ?? '';
    })
    .replace(/\{\{lead_timezone_label(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (leadTzLabel) return leadTzLabel;
      return fallback ?? '';
    })
    .replace(/\{\{trainer_timezone_label(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (trainerTzLabel) return trainerTzLabel;
      return fallback ?? '';
    })
    .replace(/\{\{current_phase_focus(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      if (phaseFocus) return phaseFocus;
      return fallback ?? '';
    })
    .replace(/\{\{handoff_directive\}\}/g, () => renderHandoffDirective(ctx))
    .replace(/\{\{lead_addressing_directive(?:\|([^}]*))?\}\}/g, (_, fallback) => {
      const directive = ctx?.leadAddressingDirective?.trim();
      if (directive) return directive;
      return fallback ?? '';
    });
}

/**
 * Cerebro v5 — Interpolación dinámica del atributo `priority="..."` en las
 * etiquetas `<phase1>` … `<phase6>` del bloque `core_v5_base`.
 *
 * Sintaxis en el .md: `priority="{{phase1_priority|reference}}"` (1..6).
 *
 * El composer reemplaza solo la fase ACTIVA con `priority="active"` y deja
 * las restantes con su fallback (típicamente `reference`). Esto baja la
 * atención del modelo sobre las fases inactivas sin necesidad de excluirlas
 * del prompt (coste ≈ 0 tokens vs. solución dinámica con sub-bloques).
 *
 * @param text - texto que contiene placeholders `{{phaseN_priority|fallback}}`
 * @param currentPhase - fase activa 1..6
 * @returns texto con los placeholders reemplazados
 */
export function interpolatePhasePriorities(text: string, currentPhase: number): string {
  if (!Number.isInteger(currentPhase) || currentPhase < 1 || currentPhase > 6) {
    // Fuera de rango — todos caen a fallback. No es bug del composer; el caller debería
    // haber validado currentPhase. Defensivo: no rompemos la composición.
    return text.replace(
      /\{\{phase([1-6])_priority(?:\|([^}]*))?\}\}/g,
      (_, _n, fallback) => fallback ?? 'reference',
    );
  }
  return text.replace(
    /\{\{phase([1-6])_priority(?:\|([^}]*))?\}\}/g,
    (_, n, fallback) => {
      const phase = parseInt(n, 10);
      if (phase === currentPhase) return 'active';
      return fallback ?? 'reference';
    },
  );
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

/**
 * Hito 12.2 — Construye la directiva markdown de personalización con el nombre
 * del lead. Se inyecta en el `{{lead_addressing_directive}}` del `core_v5_base`.
 *
 * Reglas:
 *   - mode='never' o leadNameMaxMentions=0 → "NO menciones el nombre".
 *   - mode='auto' + status='usable' + name → "Puedes usar 'Andrea' máximo N veces".
 *   - mode='auto' + status!='usable' → "NO menciones el nombre (los datos no aportan nombre legible)".
 *   - mode='always' + name → "Usa 'Andrea' máximo N veces aunque parezca handle".
 *   - mode='always' + sin name → "NO menciones el nombre (no hay dato disponible)".
 *
 * Devuelve null si no hay directiva relevante que inyectar (caller deja el
 * placeholder con su fallback genérico).
 */
export function buildLeadAddressingDirective(input: {
  mode: UseLeadNameMode;
  maxMentions: number;
  leadInference: LeadInferenceContext | null | undefined;
}): string | null {
  const { mode, maxMentions, leadInference } = input;

  if (mode === 'never' || maxMentions === 0) {
    return (
      'El trainer ha indicado que NO debes mencionar el nombre del lead en ' +
      'ningún momento de la conversación, aunque conozcas su nombre por los ' +
      'datos del canal. Trato neutro siempre.'
    );
  }

  const name = leadInference?.parsedName?.trim() || null;
  const status = leadInference?.parsedNameStatus ?? null;

  if (mode === 'always') {
    if (!name) {
      return (
        'El trainer activó "uso del nombre flexible" pero los datos del canal ' +
        'NO aportan un nombre del lead. NO inventes un nombre — trato neutro ' +
        'hasta que el propio lead te diga cómo llamarle.'
      );
    }
    return renderUseNameInstruction(name, maxMentions, /* flexible */ true);
  }

  // mode === 'auto'
  if (status === 'usable' && name) {
    return renderUseNameInstruction(name, maxMentions, /* flexible */ false);
  }
  if (status === 'not_usable' || status === 'unknown' || !status) {
    return (
      'Los datos del canal de este lead NO aportan un nombre humano legible ' +
      '(solo handle/garbage tipo usuario12345 o similar). NO inventes un ' +
      'nombre — dirígete al lead de forma neutra sin mencionarlo. Si más ' +
      'adelante el propio lead te dice cómo llamarle, úsalo entonces.'
    );
  }
  return null;
}

function renderUseNameInstruction(name: string, maxMentions: number, flexible: boolean): string {
  const word = maxMentions === 1 ? 'vez' : 'veces';
  const distribution =
    maxMentions === 1
      ? 'típicamente solo en el saludo inicial'
      : maxMentions === 2
        ? 'típicamente: saludo + un momento clave (cierre / propuesta de llamada)'
        : maxMentions === 3
          ? 'distribuye entre: saludo + 2 momentos clave de la conversación'
          : maxMentions === 4
            ? 'reparte a lo largo de la conversación, espacia las menciones — NO el nombre en cada turno consecutivo'
            : 'puedes mencionarlo casi en cada turno relevante, pero NO dos turnos seguidos';
  const flexNote = flexible
    ? ' El trainer activó modo flexible: aunque el nombre parezca tener números o suffix, úsalo igual como referencia.'
    : '';
  return (
    `Llama al lead por su nombre: **${name}**. Úsalo como máximo ${maxMentions} ` +
    `${word} en TODA la conversación (${distribution}). NO repitas el nombre dos ` +
    `turnos consecutivos — la personalización funciona por contraste con turnos ` +
    `donde NO usas el nombre.${flexNote}`
  );
}

/**
 * Hito 12.2 — Construye la directiva markdown de verificación de género cuando
 * el lead parece ser del género opuesto al `targetClientGender` del trainer.
 *
 * Se inyecta como `extraSystemSuffix` (OUT of cache) solo cuando aplica — no
 * ocupa espacio en el prompt cacheado del bloque `core_v5_base`.
 *
 * Reglas:
 *   - targetClientGender='mixed' → null (feature off).
 *   - detected_gender no opuesto (mismo género que target, ambiguous, unknown) → null.
 *   - detected_gender opuesto a target → directiva concreta soft|direct.
 *
 * Devuelve null si no aplica (no se inyecta nada).
 */
export function buildGenderVerificationDirective(input: {
  targetClientGender: TargetClientGender;
  verificationStyle: GenderVerificationStyle;
  leadInference: LeadInferenceContext | null | undefined;
}): string | null {
  const { targetClientGender, verificationStyle, leadInference } = input;
  if (targetClientGender === 'mixed') return null;

  const detected = leadInference?.detectedGender ?? null;
  if (!detected || detected === 'ambiguous' || detected === 'unknown') return null;

  // Mismatch evidente: target=male y lead=female, o target=female y lead=male.
  const isMismatch =
    (targetClientGender === 'male' && detected === 'female') ||
    (targetClientGender === 'female' && detected === 'male');
  if (!isMismatch) return null;

  const targetLabel = targetClientGender === 'male' ? 'hombres' : 'mujeres';
  const oppositeLabel = targetClientGender === 'male' ? 'mujer' : 'hombre';
  const oppositeReference = targetClientGender === 'male' ? 'una mujer' : 'un hombre';

  const lines: string[] = [];
  lines.push('## Directiva de verificación de público objetivo (Hito 12.2)');
  lines.push('');
  lines.push(
    `El trainer trabaja **SOLO con ${targetLabel}**, y nuestra detección heurística ` +
      `del nombre/datos del lead sugiere que quien escribe es probablemente ${oppositeReference}. ` +
      'NO descalifiques aún — primero confirma con una pregunta de verificación ' +
      '**en Fase 1** (NO en el saludo de Fase 0): el lead podría estar escribiendo ' +
      'por sí mismo (tu detección puede ser falsa) o por un tercero (pareja, ' +
      'familiar, amistad).',
  );
  lines.push('');
  if (verificationStyle === 'direct') {
    lines.push(
      `**Estilo directo configurado por el trainer**: en algún momento de Fase 1, ` +
        `menciona explícitamente que el programa es solo para ${targetLabel}. ` +
        'Ejemplo de frase a integrar de forma natural (NO copies literal, ' +
        `adapta al tono de la conversación): "te cuento — el programa es solo ` +
        `para ${targetLabel}. ¿Es para ti o estás escribiendo por algún ` +
        'familiar o pareja?".',
    );
  } else {
    lines.push(
      '**Estilo suave configurado por el trainer**: integra la pregunta de forma ' +
        'natural en Fase 1 SIN mencionar explícitamente que filtras por género. ' +
        'Ejemplo de frase a integrar (NO copies literal, adapta al tono): ' +
        '"por curiosidad antes de seguir, ¿estás escribiendo por ti o por algún ' +
        'familiar / pareja / cercano?".',
    );
  }
  lines.push('');
  lines.push('**Cómo continuar según la respuesta**:');
  lines.push(
    `- Si confirma que es para sí: continúa el flujo normal — nuestra detección ` +
      'puede haberse equivocado. Confía en lo que diga el lead.',
  );
  lines.push(
    `- Si confirma que es para un tercero ${targetLabel === 'hombres' ? 'hombre' : 'mujer'}: ` +
      'continúa cualificando sobre ese tercero (no sobre quien escribe). Pregunta ' +
      'por el cliente final.',
  );
  lines.push(
    `- Si confirma que es para un tercero ${oppositeLabel} (mismo género que escribe): ` +
      'descarta amablemente — explica que el programa no encaja con ese perfil. ' +
      'Marca handoff / descalificación según el flujo del Cerebro.',
  );
  lines.push('');
  lines.push(
    '**Importante**: esta directiva solo está activa porque detectamos un posible ' +
      'mismatch. Si en algún turno el lead aclara espontáneamente que es para sí ' +
      'mismo, NO repitas la pregunta — sigue el flujo normal.',
  );

  return lines.join('\n');
}
