#!/usr/bin/env tsx
/**
 * CLI E2E real para el Generator. Hace una llamada real a Anthropic Sonnet 4.5
 * con el coach + Core cargados desde Supabase y muestra:
 *   - El mensaje del setter (message_raw).
 *   - Decisiones (status, phase, recursos, reasoning).
 *   - Usage tokens + coste estimado.
 *
 * Uso (PowerShell):
 *   pnpm --filter @fyzon/motor-agente run-generator --tenant 2 --phase 1 --message "Hola, vengo del anuncio"
 *   pnpm --filter @fyzon/motor-agente run-generator --tenant 2 --phase 2 --message "Entreno 2 días, sin plan" --history "Hola|user;¿Cómo va la chamba?|assistant"
 *
 * Flags:
 *   --tenant <id>            (requerido)
 *   --phase <1..6>           (requerido)
 *   --message <texto>        (requerido) último mensaje del lead
 *   --history "a|user;b|assistant"  histórico previo separado por ';' y rol con '|'
 *   --conversation <id>      conversation_id para registrar en llm_calls (default null)
 *   --model <id>             override modelo (default claude-sonnet-4-5)
 */
import Anthropic from '@anthropic-ai/sdk';
import { runGenerator, DEFAULT_GENERATOR_MODEL } from '@fyzon/agent-pipeline';
import type { ConversationMessage } from '@fyzon/agent-pipeline';
import { getAnthropic } from '../src/lib/anthropic.js';
import { getSupabase } from '../src/lib/supabase.js';

interface Argv {
  tenant?: number;
  phase?: number;
  message?: string;
  history: ConversationMessage[];
  conversation: number | null;
  model: string;
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
        throw new Error(`history segment inválido: "${segment}". Formato: "texto|user" o "texto|assistant"`);
      }
      return { role, content };
    });
}

function parseArgs(argv: string[]): Argv {
  const out: Argv = {
    history: [],
    conversation: null,
    model: DEFAULT_GENERATOR_MODEL,
  };
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
      case '--model':
        out.model = argv[++i] ?? DEFAULT_GENERATOR_MODEL;
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
    console.error(
      'Uso: run-generator --tenant <id> --phase <1..6> --message "texto del lead" [--history "msg1|user;msg2|assistant"] [--conversation <id>] [--model <id>]',
    );
    process.exit(1);
  }

  const supabase = getSupabase();
  const anthropic = getAnthropic();

  console.log('');
  console.log('━'.repeat(78));
  console.log(`Generator E2E — tenant=${args.tenant} phase=${args.phase} model=${args.model}`);
  console.log('━'.repeat(78));
  console.log(`history (${args.history.length} msgs):`);
  for (const h of args.history) {
    console.log(`  ${h.role.padEnd(9)} : ${h.content.slice(0, 100)}`);
  }
  console.log(`user      : ${args.message}`);
  console.log('');
  console.log('Llamando a Anthropic...');

  const out = await runGenerator(
    { supabase, anthropic: anthropic as unknown as Anthropic },
    {
      tenantId: args.tenant,
      conversationId: args.conversation,
      userMessage: args.message,
      currentPhase: args.phase,
      history: args.history,
      model: args.model,
    },
  );

  console.log('');
  console.log('━'.repeat(78));
  console.log('SETTER OUTPUT');
  console.log('━'.repeat(78));
  console.log('message_raw:');
  console.log('');
  console.log(out.setterOutput.message_raw);
  console.log('');
  console.log('decisiones:');
  console.log(`  status        : ${out.setterOutput.conversation_status}`);
  console.log(`  phase_decision: ${out.setterOutput.phase_decision}`);
  if (out.setterOutput.user_summary) console.log(`  user_summary  : ${out.setterOutput.user_summary}`);
  if (out.setterOutput.resources_to_send?.length)
    console.log(`  resources     : ${out.setterOutput.resources_to_send.join(', ')}`);
  if (out.setterOutput.handoff_cause) console.log(`  handoff_cause : ${out.setterOutput.handoff_cause}`);
  if (out.setterOutput.reasoning) console.log(`  reasoning     : ${out.setterOutput.reasoning}`);

  console.log('');
  console.log('━'.repeat(78));
  console.log('USAGE & COST');
  console.log('━'.repeat(78));
  console.table({
    'tokens_in (uncached)': out.usage.tokensInUncached.toLocaleString(),
    'tokens_in (cache_read)': out.usage.tokensInCacheRead.toLocaleString(),
    'tokens_in (cache_write)': out.usage.tokensInCacheWrite.toLocaleString(),
    tokens_out: out.usage.tokensOut.toLocaleString(),
    cost_usd: `$${out.usage.costUsd.toFixed(6)}`,
    latency_ms: out.usage.latencyMs,
    stop_reason: out.usage.stopReason ?? 'n/a',
    'system_chars (cached prefix)': out.composedPromptMeta.totalChars.toLocaleString(),
    cache_breakpoints: out.composedPromptMeta.cacheBreakpoints,
    llm_call_id: out.llmCallId ?? 'no-log',
  });
}

main().catch((err) => {
  console.error('run-generator failed:', err);
  process.exit(1);
});
