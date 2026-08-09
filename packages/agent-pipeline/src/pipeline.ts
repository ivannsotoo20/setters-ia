import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateMessage, type ValidationContext, type ValidationResult } from '@fyzon/shared-validator';
import { runGenerator } from './generator.js';
import { runJudge } from './judge.js';
import { runSplitter } from './splitter.js';
import type { GeneratorInput, GeneratorOutput, GeneratorUsage } from './types.js';

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

  // Si el Generator decidió handoff explícito, devolvemos su mensaje sin pasar por Judge/Splitter.
  // Mejor: lo pasamos igual por Judge/Splitter para que el último mensaje sea limpio antes del handoff.

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

  // === 3. Validator V0-V17 ===
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
  };
  const validatorOut = validateMessage(textAfterJudge, validatorCtx);

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

  if (validatorOut.hasErrors) {
    const errs = validatorOut.violations
      .filter((v) => v.severity === 'error')
      .map((v) => `${v.ruleId}: ${v.description}`)
      .join('; ');
    throw new Error(`Validator V0-V17 found unrecoverable errors after Judge: ${errs}`);
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
  const totals = stages.reduce(
    (acc, s) => {
      acc.costUsd += s.usage.costUsd;
      acc.tokensInTotal += s.usage.tokensInUncached + s.usage.tokensInCacheRead + s.usage.tokensInCacheWrite;
      acc.tokensOutTotal += s.usage.tokensOut;
      return acc;
    },
    { costUsd: 0, latencyMs: Date.now() - startedAt, tokensInTotal: 0, tokensOutTotal: 0 },
  );
  totals.costUsd = Number(totals.costUsd.toFixed(6));

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
