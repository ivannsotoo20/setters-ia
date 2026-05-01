#!/usr/bin/env tsx
/**
 * CLI E2E del pipeline completo: Generator → Judge → Validator → Splitter.
 * Hace 3 llamadas reales (Sonnet + Haiku + Haiku) contra Anthropic e imprime
 * el resultado de cada etapa con coste/latencia.
 *
 * Uso (PowerShell):
 *   pnpm --filter @fyzon/motor-agente run-pipeline --tenant 2 --phase 1 --message "Hola, vengo del anuncio"
 *   pnpm --filter @fyzon/motor-agente run-pipeline --tenant 2 --phase 2 --message "Llevo años intentándolo" --history "Hola|user;¿Qué tal?|assistant"
 */
import Anthropic from '@anthropic-ai/sdk';
import { runPipeline, DEFAULT_GENERATOR_MODEL } from '@fyzon/agent-pipeline';
import type { ConversationMessage } from '@fyzon/agent-pipeline';
import { getAnthropic } from '../src/lib/anthropic.js';
import { getSupabase } from '../src/lib/supabase.js';

interface Argv {
  tenant?: number;
  phase?: number;
  message?: string;
  history: ConversationMessage[];
  conversation: number | null;
  generatorModel: string;
}

function parseHistory(raw: string | undefined): ConversationMessage[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const [content, role] = segment.split('|').map((p) => p.trim());
      if (!content || (role !== 'user' && role !== 'assistant')) {
        throw new Error(`history segment inválido: "${segment}"`);
      }
      return { role, content };
    });
}

function parseArgs(argv: string[]): Argv {
  const out: Argv = { history: [], conversation: null, generatorModel: DEFAULT_GENERATOR_MODEL };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--tenant':
        out.tenant = Number(argv[++i]);
        break;
      case '--phase':
        out.phase = Number(argv[++i]);
        break;
      case '--message':
        out.message = argv[++i];
        break;
      case '--history':
        out.history = parseHistory(argv[++i]);
        break;
      case '--conversation':
        out.conversation = Number(argv[++i]);
        break;
      case '--generator-model':
        out.generatorModel = argv[++i] ?? DEFAULT_GENERATOR_MODEL;
        break;
      default:
        break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.tenant === undefined || args.phase === undefined || !args.message) {
    console.error('Uso: run-pipeline --tenant <id> --phase <1..6> --message "texto" [--history "..."]');
    process.exit(1);
  }

  const supabase = getSupabase();
  const anthropic = getAnthropic();

  console.log('');
  console.log('━'.repeat(78));
  console.log(`Pipeline E2E — tenant=${args.tenant} phase=${args.phase}`);
  console.log('━'.repeat(78));
  console.log(`history (${args.history.length} msgs):`);
  for (const h of args.history) console.log(`  ${h.role.padEnd(9)} : ${h.content.slice(0, 80)}`);
  console.log(`user      : ${args.message}`);
  console.log('');

  const out = await runPipeline(
    { supabase, anthropic: anthropic as unknown as Anthropic },
    {
      tenantId: args.tenant,
      conversationId: args.conversation,
      userMessage: args.message,
      currentPhase: args.phase,
      history: args.history,
      model: args.generatorModel,
      coachSummary:
        'Pablo Montenegro / Montefit. Acento venezolano. Adultos 30-50 ocupados. Whitelist emojis: 💪 😂 😅 🔥. NUNCA precios antes F6. Una pregunta por turno.',
      validationContext: {
        channel: 'instagram',
        emojisWhitelist: ['💪', '😂', '😅', '🔥'],
      },
    },
  );

  console.log('━'.repeat(78));
  console.log('STAGES');
  console.log('━'.repeat(78));
  console.table(
    out.stages.map((s) => ({
      role: s.role,
      model: s.model,
      tokens_in: (
        s.usage.tokensInUncached + s.usage.tokensInCacheRead + s.usage.tokensInCacheWrite
      ).toLocaleString(),
      cache_read: s.usage.tokensInCacheRead.toLocaleString(),
      tokens_out: s.usage.tokensOut.toLocaleString(),
      cost_usd: `$${s.usage.costUsd.toFixed(6)}`,
      latency_ms: s.usage.latencyMs,
      notes: s.notes ?? '',
    })),
  );

  console.log('');
  console.log('━'.repeat(78));
  console.log('JUDGE');
  console.log('━'.repeat(78));
  console.log(`decision: ${out.judge.decision}`);
  if (out.judge.violations.length) console.log(`violations: ${out.judge.violations.join('; ')}`);
  if (out.judge.reasoning) console.log(`reasoning: ${out.judge.reasoning}`);

  console.log('');
  console.log('━'.repeat(78));
  console.log('VALIDATOR V0-V16');
  console.log('━'.repeat(78));
  if (out.validator.violations.length === 0) {
    console.log('Sin violaciones.');
  } else {
    for (const v of out.validator.violations) {
      console.log(`  [${v.severity}] ${v.ruleId}: ${v.description}`);
    }
  }

  console.log('');
  console.log('━'.repeat(78));
  console.log('FINAL OUTPUT (mensajes a enviar)');
  console.log('━'.repeat(78));
  out.parts.forEach((p, i) => {
    console.log(`  [${i + 1}/${out.parts.length}] (${p.length} chars) ${p}`);
  });

  console.log('');
  console.log('━'.repeat(78));
  console.log('TOTALS');
  console.log('━'.repeat(78));
  console.table({
    tokens_in_total: out.totals.tokensInTotal.toLocaleString(),
    tokens_out_total: out.totals.tokensOutTotal.toLocaleString(),
    cost_total_usd: `$${out.totals.costUsd.toFixed(6)}`,
    latency_total_ms: out.totals.latencyMs,
    setter_status: out.generator.setterOutput.conversation_status,
    setter_phase: out.generator.setterOutput.phase_decision,
  });
}

main().catch((err) => {
  console.error('run-pipeline failed:', err.message);
  process.exit(1);
});
