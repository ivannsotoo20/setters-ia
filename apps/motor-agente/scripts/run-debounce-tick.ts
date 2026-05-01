#!/usr/bin/env tsx
/**
 * CLI manual: dispara UNA iteración del cron de debounce.
 * Útil cuando queremos forzar el procesamiento sin esperar a los 5s del cron real.
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente run-debounce-tick
 *   pnpm --filter @fyzon/motor-agente run-debounce-tick --conversation 3   # fuerza una conversación específica aunque no haya vencido
 */
import Anthropic from '@anthropic-ai/sdk';
import { dropDebounce, getExpiredDebounces } from '../src/lib/debounce-buffer.js';
import { getAnthropic } from '../src/lib/anthropic.js';
import { getRedis } from '../src/lib/redis.js';
import { getSupabase } from '../src/lib/supabase.js';
import { processDebounced } from '../src/services/process-debounced.js';

interface Argv {
  conversation: number | null;
}

function parseArgs(argv: string[]): Argv {
  const out: Argv = { conversation: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--conversation') out.conversation = Number(argv[++i]);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const redis = getRedis();
  const supabase = getSupabase();
  const anthropic = getAnthropic() as unknown as Anthropic;

  let targets: number[];
  if (args.conversation !== null) {
    targets = [args.conversation];
    console.log(`Forzando proceso de conversation_id=${args.conversation} (ignora score)`);
  } else {
    const expired = await getExpiredDebounces(redis, Date.now(), 25);
    targets = expired.map((e) => e.conversationId);
    console.log(`Debounces vencidos: ${targets.length}`);
  }

  for (const conversationId of targets) {
    try {
      const out = await processDebounced({ supabase, anthropic }, conversationId);
      console.log(`✓ conversation=${conversationId} parts=${out.parts.length} schedules=${out.scheduleIds.length} cost=$${out.totalCostUsd.toFixed(6)} status=${out.pipelineStatus} phase=${out.phase}${out.skipped ? ` SKIPPED: ${out.reason}` : ''}`);
      for (let i = 0; i < out.parts.length; i++) {
        console.log(`    [${i + 1}/${out.parts.length}] (${out.parts[i]!.length} chars) ${out.parts[i]}`);
      }
    } catch (err) {
      console.error(`✗ conversation=${conversationId}:`, (err as Error).message);
    } finally {
      await dropDebounce(redis, conversationId);
    }
  }

  await redis.quit();
}

main().catch((err) => {
  console.error('run-debounce-tick failed:', err);
  process.exit(1);
});
