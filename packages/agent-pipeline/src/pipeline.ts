import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateMessage, type ValidationContext, type ValidationResult } from '@fyzon/shared-validator';
import { runGenerator } from './generator.js';
import { runJudge } from './judge.js';
import { runSplitter } from './splitter.js';
import type { CallGate, GeneratorInput, GeneratorOutput, GeneratorUsage, SetterToolOutput } from './types.js';

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
   * Precio que el entrenador autoriza decir tal cual (2026-10-07,
   * `lead_qualification.allowed_price_text`). El Judge no lo quita y V11 no lo
   * cuenta; cualquier otra cifra sigue siendo filtración.
   */
  allowedPriceText?: string | null;
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
  zone?: {
    mode: 'close' | 'handoff';
    closeParts?: string[] | null;
    /**
     * Cierres con recurso (2026-10-21, D1 de Tania), cada uno con su URL. Si el
     * cierre que escribe el modelo lleva la URL de una variante, sale esa
     * variante tal cual; si no, `closeParts`. Ver `pickZoneCloseVariant`.
     */
    closeVariants?: string[][] | null;
    /**
     * Excepción de residencia en zona declarada (formulario o chat) con un
     * prefijo de fuera: el reintento de cierre ofrece pasarla a la entrenadora
     * (handoff B). Desde 2026-10-07 solo con `true` (config
     * `residence_overrides_prefix`): por defecto el prefijo descalifica sin más.
     */
    allowResidenceHandoff?: boolean;
    /**
     * Turnos de margen antes del cierre, contando este (2026-10-21, Tania: "que
     * no corte en seco, que entienda lo que necesita"). Con más de 0 y sin el
     * cierre enviado, un turno que pregunta por lo suyo sale normal (sin V21);
     * uno que cierra, lleva un enlace o va hacia la videollamada sale como el
     * cierre literal. Con 0 o sin el campo, el turno cierra como siempre.
     */
    exploreTurnsLeft?: number;
    /**
     * Lo que dijo de su residencia («colombia», «lima»), con la residencia de fuera
     * dicha por ella. En el margen, un turno que lo nombra se reescribe una vez
     * (ver `revealsZoneReason`).
     */
    term?: string | null;
  };
  /**
   * País a tiempo (2026-10-20, V23). Solo cuando el motor decide que este turno
   * tiene que preguntar desde dónde escribe la persona: Instagram o Messenger
   * (sin prefijo), país sin saber, sin haberlo preguntado antes y en el turno N
   * de la IA o más tarde. Ver `countryAskMiss`.
   */
  countryAsk?: {
    /** Turno de la IA que se está generando (1 = el primero). */
    turn: number;
    /** Frase de la entrenadora para preguntarlo, si la configuró. */
    question?: string | null;
  };
  /**
   * D2 (2026-10-21, Tania). El precio va en dos pasos: la primera vez, una frase
   * sin cifra; la cifra autorizada (`allowedPriceText`), solo si insiste. Con
   * Elena (9 oct) la IA dio la cifra a la primera. El motor decide si la primera
   * frase ya salió en esta conversación (`firstStepDone`); mientras no, la cifra
   * autorizada cuenta como filtración para V11 y tiene un reintento. Sin esto,
   * todo como antes.
   */
  priceGate?: {
    /** La primera frase del precio, tal cual la escribió la entrenadora. */
    firstStepText: string;
    firstStepDone: boolean;
  };
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
  const closeVariants = closeParts.length > 0 ? (input.zone?.closeVariants ?? []) : [];
  const closeSent =
    closeParts.length > 0 &&
    [closeParts, ...closeVariants].some((parts) => closeAlreadySent(input.history, parts));
  // Margen antes del cierre (2026-10-21): este turno puede ser una pregunta.
  const exploring =
    zoneMode === 'close' && closeParts.length > 0 && !closeSent && (input.zone?.exploreTurnsLeft ?? 0) > 0;
  if (
    zoneMode === 'close' &&
    closeParts.length > 0 &&
    generatorOut.setterOutput.conversation_status !== 'handoff'
  ) {
    // Ya se le envió en un turno anterior: si el modelo se despide cerrando, sale
    // su despedida (más abajo, con Judge y validador); si sigue la conversación,
    // no sale nada y el estado queda cerrado. Nunca un segundo literal, y sin
    // gastar un reintento que volvería a pedir "el cierre tal cual".
    // 2026-10-21 (D1): con variantes de recurso, la que eligió el modelo por su URL.
    if (!closeSent) {
      const variant = pickZoneCloseVariant(generatorOut.setterOutput.message_raw, closeVariants);
      // Con margen, el turno que solo pregunta sigue su curso. Cualquier otra
      // cosa (cierre, un enlace, un paso hacia la videollamada) sale como el
      // cierre de la entrenadora: es lo único que puede pasar con quien no
      // cualifica por residencia.
      if (exploring && !variant && !zoneTurnWantsToClose(generatorOut.setterOutput, input)) {
        // El turno del margen lo escribe el modelo, y en la batería del v31 le dijo a
        // una lead «Ahora mismo no trabajo con personas que residan en Colombia»: el
        // motivo, que es justo lo que no se dice. Un reintento; si vuelve a dejarlo
        // ver, o cierra, sale el cierre de la entrenadora.
        if (revealsZoneReason(generatorOut.setterOutput.message_raw, input.zone?.term)) {
          const retryGen = await runGenerator(deps, {
            ...input,
            userMessage: ZONE_EXPLORE_RETRY_MESSAGE,
            history: [
              ...input.history,
              { role: 'user' as const, content: input.userMessage },
              { role: 'assistant' as const, content: generatorOut.setterOutput.message_raw },
            ],
            model: input.models?.generator,
          });
          stages.push({
            role: 'generator',
            model: retryGen.model,
            usage: retryGen.usage,
            llmCallId: retryGen.llmCallId,
            notes: 'zone_explore_retry',
          });
          const retried = retryGen.setterOutput;
          const retriedVariant = pickZoneCloseVariant(retried.message_raw, closeVariants);
          if (
            retriedVariant ||
            retried.message_raw.length === 0 ||
            zoneTurnWantsToClose(retried, input) ||
            revealsZoneReason(retried.message_raw, input.zone?.term)
          ) {
            return literalZoneCloseResult(generatorOut, retriedVariant ?? closeParts, stages, startedAt);
          }
          generatorOut.setterOutput = retried;
        }
        clearBookingProposal(generatorOut.setterOutput);
      } else {
        return literalZoneCloseResult(generatorOut, variant ?? closeParts, stages, startedAt);
      }
    } else if (!isZoneClose(generatorOut.setterOutput)) {
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
    allowedPriceText: input.allowedPriceText ?? null,
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
    // 2026-10-07 — el precio autorizado por el entrenador no es filtración (V11).
    // 2026-10-21 (D2) — salvo que aún no haya salido la primera frase del precio.
    allowedPriceText: priceFigureLocked(input) ? undefined : (input.allowedPriceText ?? undefined),
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

  // D2 (2026-10-21) — la cifra autorizada antes de la primera frase del precio.
  // Se busca por sus números (`mentionsAllowedPrice`) y no con V11, que no ve las
  // cifras con «€» o «$» detrás. Un reintento pidiendo la primera frase tal cual;
  // si vuelve con la cifra, sale solo la primera frase (decisión de Iván: mejor
  // eso que dejar a la persona sin respuesta).
  if (priceFigureLocked(input) && mentionsAllowedPrice(textForSplitter, input.allowedPriceText!)) {
    try {
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: buildPriceFirstStepRetryMessage(input.priceGate!.firstStepText, input.allowedPriceText!),
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
        notes: 'V11_retry',
      });
      textForSplitter = retryGen.setterOutput.message_raw;
      generatorOut.setterOutput.message_raw = textForSplitter;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] D2 retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
          `Se mantiene el texto original.`,
      );
    }
    if (mentionsAllowedPrice(textForSplitter, input.allowedPriceText!)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] D2: la cifra sigue tras el reintento (tenant=${input.tenantId}, conv=${input.conversationId}). ` +
          `Sale solo la primera frase del precio.`,
      );
      textForSplitter = input.priceGate!.firstStepText;
      generatorOut.setterOutput.message_raw = textForSplitter;
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
    if (hasLink || (!exploring && !zoneDone(generatorOut.setterOutput))) {
      const ruleId = hasLink ? 'V20' : 'V21';
      const retryUserMessage =
        zoneMode === 'handoff'
          ? buildZoneHandoffRetryMessage()
          : buildZoneRetryMessage({
              hasLink,
              previousStatus: generatorOut.setterOutput.conversation_status,
              allowResidenceHandoff: input.zone?.allowResidenceHandoff === true,
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

  // V23 — país a tiempo (2026-10-20). En Instagram o Messenger no hay prefijo y el
  // país solo se sabe si ella lo dice. Tania: "el país se está preguntando
  // demasiado tarde"; medido ese día, 1 de 44 conversaciones de Instagram lo
  // preguntó en los dos primeros mensajes de la IA y 15 no lo preguntaron nunca.
  // Con `countryAsk` (el motor decide que toca), un turno que ni lo pregunta ni lo
  // declara tiene UN reintento. A diferencia de V22, si el reintento falla o
  // tampoco lo pregunta, el turno sale igual: preguntarlo tarde es mejor que
  // pausar la conversación. Va antes de V22 para que el cerrojo mire el turno que
  // de verdad sale.
  if (
    input.countryAsk &&
    validatorCtx.zoneRejected !== true &&
    countryAskMiss(generatorOut.setterOutput, textForSplitter)
  ) {
    try {
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: buildCountryAskRetryMessage(input.countryAsk),
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
        notes: 'V23_retry',
      });
      const retryText = retryGen.setterOutput.message_raw;
      if (retryText.trim().length > 0) {
        if (countryAskMiss(retryGen.setterOutput, retryText)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[pipeline] V23 retry still does not ask the country (tenant=${input.tenantId}, conv=${input.conversationId}). ` +
              `Delivering retry output anyway.`,
          );
        }
        // El reintento rehace el turno entero: texto, estado, fase y lo que declara.
        generatorOut.setterOutput = retryGen.setterOutput;
        textForSplitter = retryText;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] V23 retry threw (tenant=${input.tenantId}, conv=${input.conversationId}): ${err instanceof Error ? err.message : String(err)}. ` +
          `Delivering original output.`,
      );
    }
  }

  // V22 — cerrojo de la videollamada (2026-10-07). Con `callGate`, un turno que
  // propone la videollamada o lleva el enlace de agenda (fase 5-6, `qualified` o
  // la URL del calendario en el texto) tiene que declarar en la tool que la
  // persona cualifica: país de zona y dolor de al menos N meses o un episodio
  // anterior. Si falta o no cumple, UN reintento con la instrucción concreta
  // (preguntarlo, o seguir el camino del bloque para quien no cualifica). Si el
  // reintento sigue proponiendo sin cumplir, el turno se tumba con CallGateError.
  //
  // Tania, tras meses con el mismo fallo: se seguían proponiendo y agendando
  // llamadas a personas que no cualificaban por país o por tiempo de dolor. El
  // criterio estaba en el bloque del coach; aplicarlo dependía del modelo.
  //
  // Con la zona rechazada no aplica: V20 y V21 ya obligan al cierre.
  if (input.callGate && validatorCtx.zoneRejected !== true) {
    const gate = input.callGate;
    const calendarUrl = input.composeOverrides?.trackedCalendarUrl ?? null;
    const miss = isCallStep(generatorOut.setterOutput, textForSplitter, calendarUrl)
      ? callGateMiss(generatorOut.setterOutput, gate)
      : null;
    if (miss) {
      // Si el reintento lanza (red, sobrecarga), el error sube tal cual: el motor
      // reencola el turno y lo rehace entero. Tumbarlo aquí pausaría la IA por un
      // fallo pasajero.
      const retryGen = await runGenerator(deps, {
        ...input,
        userMessage: buildCallGateRetryMessage(miss, generatorOut.setterOutput, gate),
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
        notes: `V22_retry:${miss}`,
      });
      // El reintento rehace el turno entero: texto, estado, fase y lo que declara.
      generatorOut.setterOutput = retryGen.setterOutput;
      textForSplitter = retryGen.setterOutput.message_raw;
      if (textForSplitter.length === 0) {
        return silentShutdownResult(generatorOut, stages, startedAt);
      }
      const stillMiss = isCallStep(generatorOut.setterOutput, textForSplitter, calendarUrl)
        ? callGateMiss(generatorOut.setterOutput, gate)
        : null;
      if (stillMiss) throw new CallGateError(stillMiss, generatorOut.setterOutput);
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
  if (validatorCtx.zoneRejected === true && !exploring && !zoneDone(generatorOut.setterOutput)) {
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

/**
 * Con margen antes del cierre de zona: ¿este turno ha dejado de ser una pregunta
 * sobre lo suyo? Sí si cierra (`disqualified`), si lleva cualquier enlace o si va
 * hacia la videollamada (`isCallStep`). En una fase de propuesta ya se sabe lo que
 * le pasa, así que ahí el margen no se usa y cierra.
 */
function zoneTurnWantsToClose(out: SetterToolOutput, input: PipelineInput): boolean {
  if (out.conversation_status === 'disqualified') return true;
  if (/https?:\/\//i.test(out.message_raw)) return true;
  return isCallStep(out, out.message_raw, input.composeOverrides?.trackedCalendarUrl ?? null);
}

/**
 * ¿El texto deja ver por qué no se lleva su caso? Nombra lo que dijo de su
 * residencia (`term`), habla de residir o del país, o dice que no trabaja con
 * personas de ahí. Se mira sin tildes y por palabras enteras. "Zona" no cuenta:
 * con Tania es "zona lumbar".
 */
export function revealsZoneReason(text: string, term?: string | null): boolean {
  const t = foldAccents(text);
  if (ZONE_REASON_RE.test(t)) return true;
  const k = term ? foldAccents(term).trim() : '';
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(t);
}

function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const ZONE_REASON_RE =
  /(?<![a-z])(?:resid(?:e|es|en|a|as|an|ir|encia|encias)|pais(?:es)?|no (?:trabajo|puedo trabajar) con|no (?:llevo|puedo llevar) (?:tu |su )?caso|no (?:acompano|puedo acompanar))(?![a-z])/;

const ZONE_EXPLORE_RETRY_MESSAGE =
  '[INSTRUCCIÓN DEL SISTEMA, no es un mensaje de la persona] Tu mensaje deja ver por qué no ' +
  'puedes llevar su caso (su país, su residencia o que no trabajas con personas de allí). Eso ' +
  'no se dice nunca. Reescribe este turno: si ya sabes qué le pasa, el cierre de residencia ' +
  'fuera de zona de tu bloque con el recurso que encaja, tal cual; si no, solo una pregunta ' +
  'sobre lo que le pasa, sin mencionar el país, la residencia ni ningún motivo.';

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

const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/gi;

/**
 * D1 (2026-10-21): de las variantes de cierre con recurso, la que eligió el
 * modelo, reconocida por su URL (cada variante lleva la de su vídeo). Sin URL,
 * o con una que no es de ninguna variante, null: sale el cierre por defecto. Lo
 * que sale es siempre el texto de la entrenadora, nunca el del modelo.
 */
export function pickZoneCloseVariant(
  modelText: string,
  variants: readonly (readonly string[])[] | null | undefined,
): string[] | null {
  if (!variants || variants.length === 0) return null;
  const urlKey = (u: string) => u.replace(/[.,;:!?]+$/, '').toLowerCase();
  const chosen = new Set((modelText.match(URL_IN_TEXT) ?? []).map(urlKey));
  if (chosen.size === 0) return null;
  for (const variant of variants) {
    const urls = variant.flatMap((p) => p.match(URL_IN_TEXT) ?? []).map(urlKey);
    if (urls.some((u) => chosen.has(u))) return [...variant];
  }
  return null;
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
 * Formas habituales de preguntar desde dónde escribe la persona, con y sin tilde
 * ni signo de apertura. "Desde dónde partes" (el punto de partida de su caso) no
 * es preguntar el país: tras "desde dónde" tiene que venir escribir, ser o estar.
 */
const COUNTRY_QUESTION_RE =
  /desde\s+d[oó]nde\s+(?:me\s+|nos\s+)?(?:escrib|eres|est[aá]s)|de\s+d[oó]nde\s+(?:me\s+|nos\s+)?(?:escrib|eres)|d[oó]nde\s+(?:vives|resides)|(?:en|de)\s+qu[eé]\s+pa[ií]s|qu[eé]\s+pa[ií]s\s+(?:eres|vives|est[aá]s)/i;

/** ¿El texto pregunta desde dónde escribe la persona? (V23) */
export function asksForCountry(text: string): boolean {
  return COUNTRY_QUESTION_RE.test(text);
}

/**
 * D2: ¿la cifra autorizada está bloqueada en este turno? Solo si hay precio
 * autorizado y `priceGate` dice que la primera frase aún no ha salido.
 */
export function priceFigureLocked(input: Pick<PipelineInput, 'allowedPriceText' | 'priceGate'>): boolean {
  return Boolean(input.allowedPriceText && input.priceGate && !input.priceGate.firstStepDone);
}

const NUMBER_RE = /\d{1,3}(?:[.,]\d{3})+|\d+/g;

/**
 * D2: ¿el texto da la cifra autorizada? Basta con uno de sus números de tres
 * cifras o más («entre 200 y 1.200 €» → 200 o 1200), escrito con o sin punto de
 * miles y con el símbolo pegado o no: el modelo no siempre copia el rango igual.
 */
export function mentionsAllowedPrice(text: string, allowedPriceText: string): boolean {
  const digits = (s: string) => (s.match(NUMBER_RE) ?? []).map((n) => n.replace(/[.,]/g, ''));
  const allowed = digits(allowedPriceText).filter((n) => n.length >= 3);
  if (allowed.length === 0) return false;
  const present = new Set(digits(text));
  return allowed.some((n) => present.has(n));
}

/** Instrucción del reintento de D2: sin cifra, con la primera frase tal cual. */
function buildPriceFirstStepRetryMessage(firstStepText: string, figure: string): string {
  const found = figure ? ` ("${figure}")` : '';
  return (
    `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] Tu respuesta anterior da una ` +
    `cifra de precio${found}, y en esta conversación todavía no ha salido la primera respuesta ` +
    `sobre el precio. La primera vez no se da ninguna cifra: se responde con esta frase de la ` +
    `entrenadora, tal cual: «${firstStepText}». Reescribe TU ÚLTIMA respuesta sin ninguna cifra ` +
    `de precio, manteniendo el resto si encaja. NO menciones esta corrección al lead.`
  );
}

/**
 * V23: el turno tenía que preguntar el país y no lo hace. No falla si ya lo
 * declara (`lead_country_iso`), si el turno cierra, pasa a la entrenadora o pausa,
 * o si no lleva texto.
 */
export function countryAskMiss(
  out: Pick<SetterToolOutput, 'conversation_status' | 'lead_country_iso'>,
  text: string,
): boolean {
  if (text.trim().length === 0) return false;
  if (out.conversation_status === 'disqualified' || out.conversation_status === 'handoff') return false;
  if (out.conversation_status === 'paused') return false;
  if (typeof out.lead_country_iso === 'string' && out.lead_country_iso.trim().length > 0) return false;
  return !asksForCountry(text);
}

/**
 * Instrucción del reintento de V23. Dice qué falta y con qué frase; el resto del
 * turno lo conserva el modelo.
 */
function buildCountryAskRetryMessage(ask: NonNullable<PipelineInput['countryAsk']>): string {
  const question = ask.question?.trim();
  const phrase = question
    ? `con esta frase de la entrenadora: «${question}»`
    : 'con la frase que tu bloque usa para preguntarlo';
  return (
    `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] Esta conversación va por ` +
    `Instagram o Messenger: no hay prefijo de teléfono y todavía no sabes desde dónde te escribe. ` +
    `Tu bloque pide preguntarlo al principio y este ya es tu turno ${ask.turn}. Reescribe TU ` +
    `ÚLTIMA respuesta para que termine preguntando desde dónde te escribe, ${phrase}. Mantén lo ` +
    `que ibas a decir antes, pero que la del país sea la única pregunta del turno, sin proponer ` +
    `la videollamada ni poner ningún enlace de agenda. Si ella YA te ha dicho dónde vive, ` +
    `devuelve tu misma respuesta y rellena lead_country_iso con ese país. NO menciones esta ` +
    `corrección al lead.`
  );
}

/** Lo que le falta a un turno que propone la videollamada para pasar el cerrojo. */
export type CallGateMiss = 'country_unknown' | 'country_out' | 'pain_unknown' | 'pain_recent';

/**
 * ¿Este turno lleva a la videollamada? Fase 5 (propuesta) o 6 (enlace),
 * `qualified`, o la URL del calendario en el texto aunque la fase diga otra cosa.
 * Un turno que cierra, pasa a la entrenadora o pausa no lleva a nada; F7 es
 * después de la reserva.
 */
export function isCallStep(
  out: Pick<SetterToolOutput, 'conversation_status' | 'phase_decision'>,
  text: string,
  calendarUrl: string | null | undefined,
): boolean {
  if (out.conversation_status === 'disqualified' || out.conversation_status === 'handoff') return false;
  if (out.conversation_status === 'paused') return false;
  if (out.conversation_status === 'qualified') return true;
  if (out.phase_decision === 5 || out.phase_decision === 6) return true;
  const base = (calendarUrl ?? '').split('?')[0]!.trim();
  return base.length > 0 && text.includes(base);
}

/**
 * Qué falta para que la persona vaya a videollamada según lo que el setter
 * declara en la tool, o null si cumple. Primero el país (con el país de fuera no
 * hace falta mirar más), luego el dolor.
 */
export function callGateMiss(
  out: Pick<SetterToolOutput, 'lead_country_iso' | 'pain_duration_months' | 'previous_episode'>,
  gate: CallGate,
): CallGateMiss | null {
  if (gate.allowedCountries && !gate.countryKnownInZone) {
    const iso = out.lead_country_iso?.toUpperCase();
    if (!iso) return 'country_unknown';
    if (!gate.allowedCountries.includes(iso)) return 'country_out';
  }
  if (gate.minPainMonths != null && out.previous_episode !== true) {
    const months = out.pain_duration_months;
    if (months == null) return 'pain_unknown';
    if (months < gate.minPainMonths) return 'pain_recent';
  }
  return null;
}

/** Prefijo estable del error de V22: el motor lo reconoce para no reencolar el turno. */
export const CALL_GATE_ERROR_PREFIX = 'V22: videollamada sin cualificar';

/**
 * El turno proponía la videollamada (o llevaba el enlace) a alguien que, según
 * lo que declara el propio setter, no cualifica o de quien falta un dato, y el
 * reintento no lo corrigió. No sale nada: el motor pausa la IA y avisa a la
 * entrenadora.
 */
export class CallGateError extends Error {
  readonly ruleId = 'V22' as const;
  readonly miss: CallGateMiss;

  constructor(miss: CallGateMiss, out: Pick<SetterToolOutput, 'conversation_status' | 'phase_decision'>) {
    super(
      `${CALL_GATE_ERROR_PREFIX} (${miss}; conversation_status=${out.conversation_status}, ` +
        `phase_decision=${out.phase_decision}). El turno no se envía.`,
    );
    this.name = 'CallGateError';
    this.miss = miss;
  }
}

/**
 * Instrucción del reintento de V22. Dice qué falta y qué hacer en su lugar; el
 * cómo (la pregunta, el cierre, el recurso) sigue siendo del bloque del coach.
 */
function buildCallGateRetryMessage(
  miss: CallGateMiss,
  out: Pick<SetterToolOutput, 'lead_country_iso' | 'pain_duration_months'>,
  gate: CallGate,
): string {
  const head =
    `[CORRECCIÓN AUTOMÁTICA DEL SISTEMA — NO ES MENSAJE DEL LEAD] Tu respuesta anterior lleva ` +
    `a la videollamada (la propone, manda el enlace o la da por cualificada), y `;
  const noCall =
    `sin proponer la videollamada ni poner ningún enlace de agenda, y con la fase 4 como mucho. `;
  const tail = `NO menciones esta corrección al lead.`;
  switch (miss) {
    case 'country_unknown':
      return (
        head +
        `no has declarado en qué país vive: la entrenadora solo hace videollamada a quien vive en ` +
        `su zona de contacto. Si ella YA te ha dicho dónde vive (en el chat o en su formulario), ` +
        `devuelve tu misma respuesta y rellena lead_country_iso con ese país. Si no te lo ha dicho, ` +
        `reescribe TU ÚLTIMA respuesta preguntándole dónde vive, con naturalidad y en una sola ` +
        `pregunta, ` +
        noCall +
        tail
      );
    case 'country_out':
      return (
        head +
        `según tú mismo vive en ${out.lead_country_iso ?? 'un país'}, fuera de la zona de ` +
        `contacto de la entrenadora. Reescribe TU ÚLTIMA respuesta siguiendo el camino de fuera de ` +
        `zona que define tu bloque (coach_qualification_doesnt), sin nombrar el país ni el motivo, ` +
        noCall +
        tail
      );
    case 'pain_unknown':
      return (
        head +
        `no has declarado desde cuándo le duele: la entrenadora solo hace videollamada a quien ` +
        `lleva al menos ${gate.minPainMonths} meses con el dolor o ha tenido un episodio anterior. ` +
        `Si ella YA te lo ha dicho (en el chat o en su formulario), devuelve tu misma respuesta y ` +
        `rellena pain_duration_months (y previous_episode si describió un episodio anterior). Si ` +
        `no, reescribe TU ÚLTIMA respuesta preguntándoselo, con naturalidad y en una sola ` +
        `pregunta, ` +
        noCall +
        tail
      );
    case 'pain_recent':
      return (
        head +
        `según tú mismo lleva ${out.pain_duration_months} meses con el dolor y no ha descrito un ` +
        `episodio anterior: con el criterio de la entrenadora (al menos ${gate.minPainMonths} ` +
        `meses o un episodio anterior) no es caso de videollamada. Si en realidad sí describió un ` +
        `episodio anterior del mismo dolor, devuelve tu misma respuesta con previous_episode=true. ` +
        `Si no, reescribe TU ÚLTIMA respuesta siguiendo lo que tu bloque dice para el dolor ` +
        `reciente, ` +
        noCall +
        tail
      );
  }
}

/**
 * Instrucción del reintento de zona. La misma para V20 y V21 (el cierre del
 * bloque); solo cambia la primera frase, que le dice qué ha hecho mal.
 */
function buildZoneRetryMessage(args: {
  hasLink: boolean;
  previousStatus: SetterToolOutput['conversation_status'];
  allowResidenceHandoff?: boolean;
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
    `conversation_status="disqualified". ` +
    (args.allowResidenceHandoff
      ? `Única excepción: si ella ha escrito, en el formulario o en el chat, que reside en un ` +
        `país de la zona de contacto, devuelve conversation_status="handoff" con ` +
        `handoff_cause="B_derivacion" y un mensaje breve de que le escribe la entrenadora. `
      : '') +
    `NO menciones esta corrección al lead.`
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
