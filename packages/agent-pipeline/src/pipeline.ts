import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateMessage, type ValidationContext, type ValidationResult } from '@fyzon/shared-validator';
import { runGenerator } from './generator.js';
import { runJudge } from './judge.js';
import { runSplitter } from './splitter.js';
import type { GeneratorInput, GeneratorOutput, GeneratorUsage, SetterToolOutput } from './types.js';

interface RunPipelineDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

export interface PipelineInput extends GeneratorInput {
  /** Para el validador V0-V16. */
  validationContext?: Partial<ValidationContext>;
  /** Override de los modelos por etapa. */
  models?: {
    generator?: string;
    judge?: string;
    splitter?: string;
  };
  /** Resumen del coach que recibe el Judge (1-2 frases). */
  coachSummary?: string;
  /**
   * Zona (2026-09-26). Solo con `validationContext.zoneRejected`:
   *   - mode 'close': la persona no cualifica por residencia; el turno cierra
   *     (`disqualified`), salvo la excepción de residencia en zona declarada en
   *     el chat (handoff B_derivacion), que decide el modelo.
   *   - mode 'handoff': prefijo de fuera con residencia en zona declarada en el
   *     formulario (D1 de Iván); el turno pasa a la entrenadora (handoff B).
   *   - closeParts: el literal del cierre tal y como lo escribió la entrenadora.
   *     En modo 'close' se envía ESE texto en vez del que escriba el modelo (la
   *     primera vez: si ya se le envió, el modelo se despide sin repetirlo).
   * Sin `zone`, con `zoneRejected` se asume 'close' sin literal (comportamiento
   * del primer despliegue de V21).
   */
  zone?: { mode: 'close' | 'handoff'; closeParts?: string[] | null };
}

export interface PipelineStageMetric {
  role: 'generator' | 'judge' | 'splitter';
  model: string;
  usage: GeneratorUsage;
  llmCallId?: number;
  notes?: string;
}

export interface PipelineOutput {
  /** Mensajes finales listos para enviar (1-4 partes). */
  parts: string[];
  /** Output completo del Generator (status, fase, etc.). */
  generator: GeneratorOutput;
  /** Decisión del Judge. */
  judge: { decision: 'pass' | 'fix' | 'reject'; violations: string[]; reasoning?: string };
  /** Resultado del Validador V0-V16 sobre el texto post-Judge. */
  validator: ValidationResult;
  /** Stage metrics por etapa (incluye coste y latencia). */
  stages: PipelineStageMetric[];
  /** Totales agregados. */
  totals: {
    costUsd: number;
    latencyMs: number;
    tokensInTotal: number;
    tokensOutTotal: number;
  };
}

/**
 * Orquesta el pipeline completo:
 *   Generator (Sonnet 5) → Judge (Haiku 4.5) → Validator (det) → Splitter (Haiku 4.5)
 *
 * El Generator es el único que se subió a Sonnet: es el que escribe. El Judge y
 * el Splitter siguen en Haiku a propósito, porque hacen trabajo mecánico
 * (aprobar/rechazar, trocear) donde el modelo grande no aporta y sí multiplica
 * el coste de cada turno por tres.
 *
 * Si Judge devuelve `reject`, la función lanza Error — el caller decide si reintenta
 * con otro Generator o hace handoff a humano.
 *
 * Si el Validator detecta `severity=error` post-Judge, también lanza Error (red de
 * seguridad — significa que ni el Generator ni el Judge captaron la violación crítica).
 *
 * Con `validationContext.zoneRejected`, un turno que no cierra (ni `disqualified` ni
 * `handoff` B_derivacion / C_descualificado, ver `isZoneClose`) tras un reintento
 * lanza `ZoneCloseError` (V21).
 */
export async function runPipeline(
  deps: RunPipelineDeps,
  input: PipelineInput,
): Promise<PipelineOutput> {
  const startedAt = Date.now();
  const stages: PipelineStageMetric[] = [];

  // === 1. Generator ===
  const generatorOut = await runGenerator(deps, {
    ...input,
    model: input.models?.generator,
  });
  stages.push({
    role: 'generator',
    model: generatorOut.model,
    usage: generatorOut.usage,
    llmCallId: generatorOut.llmCallId,
  });

  // APAGADO SILENCIOSO: el coach ordenó no contestar nada. No hay texto que
  // juzgar ni que trocear, así que se cortocircuita aquí. Lo que importa río
  // abajo es el handoff, no el mensaje: el caller pausa la conversación y avisa
  // al entrenador. Pasarlo por el Judge solo podría estropearlo.
  //
  // Con zona rechazada tampoco aplica V21: no sale ningún mensaje que siga
  // cualificando y el handoff (obligatorio con mensaje vacío) cierra la conversación.
  // Va ANTES del literal de zona: el apagado mudo es también el de una emergencia
  // (crisis, ideación, violencia) y a esa persona no le sale el cierre comercial.
  if (generatorOut.setterOutput.message_raw.length === 0) {
    return silentShutdownResult(generatorOut, stages, startedAt);
  }

  // CIERRE POR ZONA CON LITERAL (2026-09-26). El motor ya ha decidido que esta
  // persona no cualifica por residencia. Si el modelo NO la ha pasado a la
  // entrenadora (cualquier handoff: la excepción B de residencia en zona, un
  // "quiero hablar con Tania", una descualificación grave), su salida se sustituye
  // por el cierre que escribió la entrenadora, tal cual: en la batería de ese día
  // el modelo, con la orden de copiarlo, le puso delante "Ahora mismo no puedo
  // llevar tu caso directamente…" a un +57. Sin Judge ni Splitter: es el texto de
  // la entrenadora, burbuja a burbuja.
  const zoneMode = input.validationContext?.zoneRejected === true ? (input.zone?.mode ?? 'close') : null;
  const closeParts = input.zone?.closeParts?.filter((p) => p.trim().length > 0) ?? [];
  const closeSent = closeParts.length > 0 && closeAlreadySent(input.history, closeParts);
  if (
    zoneMode === 'close' &&
    closeParts.length > 0 &&
    generatorOut.setterOutput.conversation_status !== 'handoff'
  ) {
    // Ya se le envió en un turno anterior: si el modelo se despide cerrando, sale
    // su despedida (más abajo, con Judge y validador); si sigue la conversación,
    // no sale nada y el estado queda cerrado. Nunca un segundo literal, y sin
    // gastar un reintento que volvería a pedir "el cierre tal cual".
    if (!closeSent) {
      return literalZoneCloseResult(generatorOut, closeParts, stages, startedAt);
    }
    if (!isZoneClose(generatorOut.setterOutput)) {
      generatorOut.setterOutput.message_raw = '';
      generatorOut.setterOutput.conversation_status = 'disqualified';
      generatorOut.setterOutput.handoff_cause = undefined;
      clearBookingProposal(generatorOut.setterOutput);
      return silentShutdownResult(generatorOut, stages, startedAt);
    }
  }

  // === 2. Judge ===
  const judgeOut = await runJudge(deps, {
    messageRaw: generatorOut.setterOutput.message_raw,
    currentPhase: input.currentPhase,
    coachSummary: input.coachSummary,
    conversationContext: `Último mensaje del lead: "${input.userMessage.slice(0, 200)}"`,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    model: input.models?.judge,
  });
  stages.push({
    role: 'judge',
    model: input.models?.judge ?? 'claude-haiku-4-5',
    usage: judgeOut.usage,
    llmCallId: judgeOut.llmCallId,
    notes: `decision=${judgeOut.decision}; violations=${judgeOut.violations.length}`,
  });

  if (judgeOut.decision === 'reject') {
    throw new Error(
      `Judge rejected message: ${judgeOut.violations.join('; ')}. reasoning="${judgeOut.reasoning ?? ''}"`,
    );
  }

  const textAfterJudge = judgeOut.finalText;

  // === 3. Validator V0-V19 ===
  const validatorCtx: ValidationContext = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    currentPhase: generatorOut.setterOutput.phase_decision,
    channel: (input.validationContext?.channel ?? 'instagram') as ValidationContext['channel'],
    emojisWhitelist: input.validationContext?.emojisWhitelist ?? null,
    isFirstAssistantMessage:
      input.validationContext?.isFirstAssistantMessage ?? input.history.every((h) => h.role === 'user'),
    lastAssistantMessages: input.validationContext?.lastAssistantMessages ?? [],
    locale: input.validationContext?.locale,
    // Hito 12.1 — V17 usa esta lista para detectar vocabulario prohibido.
    forbiddenPhrases: input.validationContext?.forbiddenPhrases,
    // 2026-09-12 — V20: la persona no cualifica por residencia (zona); ningún
    // turno puede llevar una URL. 2026-09-26 — V21 (más abajo, sobre el estado y
    // no sobre el texto): además, el turno tiene que cerrar.
    zoneRejected: input.validationContext?.zoneRejected,
  };
  let validatorOut = validateMessage(textAfterJudge, validatorCtx);

  // Hito 12.1 — V17 retry logic. Si el output viola palabras prohibidas del trainer,
  // reinvocamos el Generator una sola vez con instrucción explícita de reescribir.
  // Si tras retry V17 sigue → log incidente + degradación grácil (entregamos el
  // output del retry porque al menos lo intentó; si el retry fail por excepción,
  // entregamos el original). NO bloqueamos la conversación.
  let textForSplitter = textAfterJudge;
  const v17Violations = validatorOut.violations.filter((v) => v.ruleId === 'V17');
  if (v17Violations.length > 0 && (input.validationContext?.forbiddenPhrases?.length ?? 0) > 0) {
    const violatedWords = v17Violations
      .flatMap((v) => (v.match ?? '').split('|'))
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    const allForbidden = (input.validationContext?.forbiddenPhrases ?? []).join(', ');
    const retryHistory = [
      ...input.history,
      { role: 'user' as const, content: input.userMessage },
      { role: 'assistant' as const, content: textAfterJudge },
    ];
    const retryUserMessage =
      `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] ` +
      `Tu respuesta anterior contiene palabra(s) prohibida(s) por el trainer: ${violatedWords.join(', ')}. ` +
      `Reescribe TU ÚLTIMA respuesta SIN usar ninguna de las siguientes palabras prohibidas: ${allForbidden}. ` +
      `Mantén el mismo sentido, longitud aproximada, fase, estado y datos. NO menciones esta corrección al lead — ` +
      `el lead solo verá tu nueva respuesta limpia.`;

    try {
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: retryUserMessage,
        history: retryHistory,
        model: input.models?.generator,
      });
      stages.push({
        role: 'generator',
        model: retryGen.model,
        usage: retryGen.usage,
        llmCallId: retryGen.llmCallId,
        notes: 'V17_retry',
      });
      const retryText = retryGen.setterOutput.message_raw;
      const retryValidator = validateMessage(retryText, validatorCtx, { only: ['V17'] });
      if (retryValidator.violations.length === 0) {
        // Retry exitoso — usar el output reescrito para el Splitter.
        textForSplitter = retryText;
        generatorOut.setterOutput.message_raw = retryText;
      } else {
        // Retry insistió en usar palabras prohibidas. Degradación grácil: entregamos
        // el retry de todos modos (mejor que el original — al menos lo intentó) y
        // loggeamos para revisar el coach o las palabras.
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline] V17 retry still violates trainer phrases (tenant=${input.tenantId}, conv=${input.conversationId}). ` +
            `Original violated: ${violatedWords.join(', ')}. Delivering retry output anyway.`,
        );
        textForSplitter = retryText;
        generatorOut.setterOutput.message_raw = retryText;
      }
    } catch (err) {
      // El retry tiró excepción (network, tool no usada, etc). Degradación grácil:
      // entregamos el output ORIGINAL y loggeamos. La conversación no se bloquea.
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] V17 retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
          `Delivering original output despite violation: ${violatedWords.join(', ')}.`,
      );
    }
  }

  // V19 — marcador sin resolver ([ENLACE], {{...}}, SIN_CALENDARIO). A diferencia
  // de V17, aquí no cabe degradar: entregar el mensaje con el hueco es peor que no
  // entregarlo. Se reintenta UNA vez pidiendo la URL entera, y si el segundo intento
  // vuelve con el hueco, el turno se tumba abajo por `hasErrors`.
  //
  // Caso que lo motivó (batería 2026-08-25, tenant 7): "Aquí está el link para que
  // revises: [ENLACE]" a un lead que llevaba cinco turnos pidiéndolo.
  const v19Violations = validateMessage(textForSplitter, validatorCtx, { only: ['V19'] }).violations;
  if (v19Violations.length > 0) {
    const hueco = v19Violations[0]!.match ?? '';
    const retryUserMessage =
      `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] ` +
      `Tu respuesta anterior contiene un marcador sin rellenar: "${hueco}". Al lead le llegaría ` +
      `ese texto tal cual. Reescribe TU ÚLTIMA respuesta: si toca dar el enlace, pega la URL ` +
      `completa exactamente como aparece en el bloque del coach; si no dispones de la URL ` +
      `literal, no menciones el enlace en este turno y sigue con el objetivo de la fase. ` +
      `Nunca escribas corchetes, llaves ni huecos en su lugar. NO menciones esta corrección al lead.`;
    try {
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: retryUserMessage,
        history: [
          ...input.history,
          { role: 'user' as const, content: input.userMessage },
          { role: 'assistant' as const, content: textForSplitter },
        ],
        model: input.models?.generator,
      });
      stages.push({
        role: 'generator',
        model: retryGen.model,
        usage: retryGen.usage,
        llmCallId: retryGen.llmCallId,
        notes: 'V19_retry',
      });
      textForSplitter = retryGen.setterOutput.message_raw;
      generatorOut.setterOutput.message_raw = textForSplitter;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] V19 retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
          `Se mantiene el texto original y el turno se tumbará por V19.`,
      );
    }
  }

  // Zona (V20 + V21) — la persona NO cualifica por residencia. El motor lo ha
  // decidido por el prefijo del teléfono y se lo ha dicho al setter dos veces: como
  // hecho en la directiva ("Zona geográfica") y como orden en la focal de cierre.
  // Por debajo del modelo, dos redes deterministas que comparten UN reintento:
  //
  //   - V20: el turno no puede llevar URL. Tenant 7, 2026-09-11: un +502
  //     (Guatemala) recibió el enlace de agenda.
  //   - V21: el turno tiene que CERRAR. Conv 12203 (2026-09-23, Instagram con
  //     teléfono +57): V20 impidió el enlace, pero el modelo siguió cualificando
  //     24 mensajes porque, según su propio razonamiento, cerraría "cuando
  //     corresponda". Cierre es `disqualified`, o `handoff` con B_derivacion
  //     cuando ella ha declarado residencia en zona (formulario "En Canadá" con
  //     un +502: se lo confirma la entrenadora).
  //
  // Si el reintento vuelve con URL, el turno se tumba abajo por `hasErrors` (V20);
  // si vuelve sin cerrar, se tumba con ZoneCloseError (V21). Un solo reintento
  // para las dos cosas porque la instrucción es la misma: el cierre de su bloque.
  const zoneDone = (out: Pick<SetterToolOutput, 'conversation_status' | 'handoff_cause'>) =>
    zoneMode === 'handoff' ? isZoneHandoffB(out) : isZoneClose(out);
  if (validatorCtx.zoneRejected === true) {
    const hasLink =
      validateMessage(textForSplitter, validatorCtx, { only: ['V20'] }).violations.length > 0;
    if (hasLink || !zoneDone(generatorOut.setterOutput)) {
      const ruleId = hasLink ? 'V20' : 'V21';
      const retryUserMessage =
        zoneMode === 'handoff'
          ? buildZoneHandoffRetryMessage()
          : buildZoneRetryMessage({
              hasLink,
              previousStatus: generatorOut.setterOutput.conversation_status,
            });
      try {
        const retryGen = await runGenerator(deps, {
          ...input,
          userMessage: retryUserMessage,
          history: [
            ...input.history,
            { role: 'user' as const, content: input.userMessage },
            { role: 'assistant' as const, content: textForSplitter },
          ],
          model: input.models?.generator,
        });
        stages.push({
          role: 'generator',
          model: retryGen.model,
          usage: retryGen.usage,
          llmCallId: retryGen.llmCallId,
          notes: `${ruleId}_retry`,
        });
        textForSplitter = retryGen.setterOutput.message_raw;
        generatorOut.setterOutput.message_raw = textForSplitter;
        // El reintento decide también estado y fase: si cerró, que conste.
        generatorOut.setterOutput.conversation_status = retryGen.setterOutput.conversation_status;
        generatorOut.setterOutput.phase_decision = retryGen.setterOutput.phase_decision;
        generatorOut.setterOutput.handoff_cause = retryGen.setterOutput.handoff_cause;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline] ${ruleId} retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
            `Se mantiene la respuesta original y el turno se tumbará por ${ruleId}.`,
        );
      }

      // El reintento eligió el apagado silencioso (mensaje vacío, que el Generator
      // solo admite con handoff). No sale nada y el handoff cierra la conversación:
      // es tan seguro como el cierre. Sin esto, V00 tumbaría un turno correcto.
      if (textForSplitter.length === 0) {
        return silentShutdownResult(generatorOut, stages, startedAt);
      }
    }
  }

  // Si algún retry reescribió el mensaje, el veredicto de arriba describe un texto
  // que ya no es el que va a salir. Se revalida sobre el final.
  if (textForSplitter !== textAfterJudge) {
    validatorOut = validateMessage(textForSplitter, validatorCtx);
  }

  if (validatorOut.hasErrors) {
    const errs = validatorOut.violations
      .filter((v) => v.severity === 'error')
      .map((v) => `${v.ruleId}: ${v.description}`)
      .join('; ');
    throw new Error(`Validator V0-V20 found unrecoverable errors after Judge: ${errs}`);
  }

  // V21 — tras el reintento, el turno sigue sin cerrar. Se tumba ANTES del Splitter:
  // un mensaje que sigue cualificando a quien no cualifica por residencia no sale,
  // por bien escrito que esté. Va detrás de `hasErrors` para que un turno que
  // además insiste en la URL se reporte como V20, que es el fallo más grave.
  if (validatorCtx.zoneRejected === true && !zoneDone(generatorOut.setterOutput)) {
    throw new ZoneCloseError(generatorOut.setterOutput);
  }

  // === 4. Splitter ===
  // Hito 12.1 — propaga `aiMessagesPerTurnMax` (cap del trainer) al Splitter
  // para que respete `maxItems` dinámico y el fallback determinístico.
  const splitterOut = await runSplitter(deps, {
    finalText: textForSplitter,
    channel: validatorCtx.channel,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    model: input.models?.splitter,
    maxParts: input.aiMessagesPerTurnMax,
  });
  stages.push({
    role: 'splitter',
    model: input.models?.splitter ?? 'claude-haiku-4-5',
    usage: splitterOut.usage,
    llmCallId: splitterOut.llmCallId,
    notes: `parts=${splitterOut.parts.length}${splitterOut.fallback ? ' (fallback)' : ''}`,
  });

  // === Totals ===
  const totals = computeTotals(stages, Date.now() - startedAt);

  return {
    parts: splitterOut.parts,
    generator: generatorOut,
    judge: {
      decision: judgeOut.decision,
      violations: judgeOut.violations,
      reasoning: judgeOut.reasoning,
    },
    validator: validatorOut,
    stages,
    totals,
  };
}

/**
 * V21 — ¿este output cierra la conversación con alguien que no cualifica por
 * residencia? Cierra `disqualified`, o `handoff` con B_derivacion (ella ha
 * declarado residencia en zona y lo confirma la entrenadora) o con
 * C_descualificado (handoff tras descualificación grave: también es un cierre;
 * tumbarlo costaría un reintento y, si el modelo insiste, dejaría a la persona
 * sin mensaje). Cualquier otro estado sigue la conversación o la cierra por un
 * motivo que no es la zona.
 */
export function isZoneClose(
  out: Pick<SetterToolOutput, 'conversation_status' | 'handoff_cause'>,
): boolean {
  if (out.conversation_status === 'disqualified') return true;
  // Cualquier handoff a la entrenadora cierra el turno del setter (revisión del
  // 2026-09-26): B (residencia en zona declarada), C (descualificación grave) y
  // también D ("quiero hablar con Tania") o el apagado de una emergencia. Lo que
  // NO vale es A_agenda: eso es dar por agendada a alguien que no se lleva.
  return out.conversation_status === 'handoff' && out.handoff_cause !== 'A_agenda';
}

/** Con la zona rechazada no se reserva nada: fuera cualquier franja propuesta. */
function clearBookingProposal(out: SetterToolOutput): void {
  if (out.proposed_booking_slot !== undefined) out.proposed_booking_slot = undefined;
}

/** La excepción de zona: residencia en zona declarada → la confirma la entrenadora. */
export function isZoneHandoffB(
  out: Pick<SetterToolOutput, 'conversation_status' | 'handoff_cause'>,
): boolean {
  return out.conversation_status === 'handoff' && out.handoff_cause === 'B_derivacion';
}

/**
 * ¿Ya se le envió el cierre en un turno anterior? Se mira si alguna respuesta
 * del setter en el historial contiene la primera burbuja del literal. Tras el
 * `disqualified` la conversación queda en 'stopped' y la IA sigue contestando:
 * repetirle el mismo cierre cada vez que escriba sería peor que despedirse.
 */
export function closeAlreadySent(
  history: ReadonlyArray<{ role: string; content: string }>,
  closeParts: readonly string[],
): boolean {
  const first = normalizeForCompare(closeParts[0] ?? '');
  if (!first) return false;
  return history.some((h) => h.role === 'assistant' && normalizeForCompare(h.content).includes(first));
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Turno de cierre por zona con el literal configurado. El estado lo fija el
 * motor (`disqualified`), no el modelo; la fase se conserva (el motor la topa
 * en F4 con la zona rechazada).
 */
function literalZoneCloseResult(
  generatorOut: GeneratorOutput,
  closeParts: string[],
  stages: PipelineStageMetric[],
  startedAt: number,
): PipelineOutput {
  const finalText = closeParts.join('\n\n');
  generatorOut.setterOutput.message_raw = finalText;
  generatorOut.setterOutput.conversation_status = 'disqualified';
  generatorOut.setterOutput.handoff_cause = undefined;
  clearBookingProposal(generatorOut.setterOutput);
  return {
    parts: [...closeParts],
    generator: generatorOut,
    judge: { decision: 'pass', violations: [], reasoning: 'cierre por zona: literal de la entrenadora' },
    validator: { ok: true, violations: [], finalText } as unknown as ValidationResult,
    stages,
    totals: computeTotals(stages, Date.now() - startedAt),
  };
}

/** Prefijo estable del error de V21: el motor lo reconoce para no reencolar el turno. */
export const ZONE_CLOSE_ERROR_PREFIX = 'V21: zona rechazada sin cierre';

/**
 * El turno de una persona que no cualifica por residencia no cerró ni tras el
 * reintento. Se lanza en vez de entregar el mensaje: el cierre por zona no puede
 * depender de que el modelo lo decida (Iván, tras la conv 12203).
 */
export class ZoneCloseError extends Error {
  readonly ruleId = 'V21' as const;
  readonly conversationStatus: SetterToolOutput['conversation_status'];
  readonly handoffCause: SetterToolOutput['handoff_cause'];

  constructor(out: Pick<SetterToolOutput, 'conversation_status' | 'handoff_cause'>) {
    super(
      `${ZONE_CLOSE_ERROR_PREFIX} (conversation_status=${out.conversation_status}` +
        `${out.handoff_cause ? `, handoff_cause=${out.handoff_cause}` : ''}). ` +
        `El turno no se envía: seguía la conversación con una persona fuera de zona.`,
    );
    this.name = 'ZoneCloseError';
    this.conversationStatus = out.conversation_status;
    this.handoffCause = out.handoff_cause;
  }
}

/**
 * Instrucción del reintento de zona. La misma para V20 y V21 (el cierre del
 * bloque); solo cambia la primera frase, que le dice qué ha hecho mal.
 */
function buildZoneRetryMessage(args: {
  hasLink: boolean;
  previousStatus: SetterToolOutput['conversation_status'];
}): string {
  // Neutro sobre el MOTIVO: la zona se rechaza por el prefijo del teléfono o por
  // la residencia que ella dijo en el chat (sin teléfono). Revisión del 26-09.
  const whatWentWrong = args.hasLink
    ? `Tu respuesta anterior contiene un enlace, y esta persona NO cualifica por residencia ` +
      `(el motor lo ha comprobado y te lo ha indicado en la sección "Zona geográfica"). `
    : `Esta persona NO cualifica por residencia (el motor lo ha comprobado y te lo ha indicado ` +
      `en la sección "Zona geográfica") y tu respuesta anterior sigue la conversación ` +
      `(conversation_status="${args.previousStatus}") en vez de cerrarla. El cierre es en este ` +
      `turno, no en uno posterior. `;
  return (
    `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] ` +
    whatWentWrong +
    `Reescribe TU ÚLTIMA respuesta como el cierre de residencia fuera de zona que define tu ` +
    `bloque (coach_qualification_doesnt), tal cual: sin ninguna URL, sin propuesta de ` +
    `videollamada, sin nombrar el país ni el motivo, y sin preguntas. Si ese cierre ya se lo ` +
    `enviaste en un turno anterior, no lo repitas: una frase breve de despedida. Devuelve ` +
    `conversation_status="disqualified". Única excepción: si ella ha escrito, en el formulario ` +
    `o en el chat, que reside en un país de la zona de contacto, devuelve ` +
    `conversation_status="handoff" con handoff_cause="B_derivacion" y un mensaje breve de que ` +
    `le escribe la entrenadora. NO menciones esta corrección al lead.`
  );
}

/** Reintento de la excepción D1: el turno pasa a la entrenadora, no cierra ni sigue. */
function buildZoneHandoffRetryMessage(): string {
  return (
    `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] ` +
    `Su teléfono es de un país al que la entrenadora no lleva, pero en su formulario declaró ` +
    `vivir en uno al que sí lleva (sección "Zona geográfica"), y tu respuesta anterior no la pasa ` +
    `a la entrenadora. Reescribe TU ÚLTIMA respuesta como un mensaje breve de que le escribe la ` +
    `entrenadora, sin enlace, sin propuesta de videollamada y sin preguntas, y devuelve ` +
    `conversation_status="handoff" con handoff_cause="B_derivacion". NO menciones esta corrección al lead.`
  );
}

/** Turno sin mensaje (apagado silencioso): nada que juzgar, validar ni trocear. */
function silentShutdownResult(
  generatorOut: GeneratorOutput,
  stages: PipelineStageMetric[],
  startedAt: number,
): PipelineOutput {
  return {
    parts: [],
    generator: generatorOut,
    judge: { decision: 'pass', violations: [], reasoning: 'apagado silencioso: no hay mensaje que juzgar' },
    validator: { ok: true, violations: [], finalText: '' } as unknown as ValidationResult,
    stages,
    totals: computeTotals(stages, Date.now() - startedAt),
  };
}

/** Agrega coste y tokens de las etapas que llegaron a ejecutarse. */
function computeTotals(
  stages: PipelineStageMetric[],
  latencyMs: number,
): PipelineOutput['totals'] {
  const totals = stages.reduce(
    (acc, s) => {
      acc.costUsd += s.usage.costUsd;
      acc.tokensInTotal +=
        s.usage.tokensInUncached + s.usage.tokensInCacheRead + s.usage.tokensInCacheWrite;
      acc.tokensOutTotal += s.usage.tokensOut;
      return acc;
    },
    { costUsd: 0, latencyMs, tokensInTotal: 0, tokensOutTotal: 0 },
  );
  totals.costUsd = Number(totals.costUsd.toFixed(6));
  return totals;
}
