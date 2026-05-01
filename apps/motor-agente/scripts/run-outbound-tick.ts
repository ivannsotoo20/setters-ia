#!/usr/bin/env tsx
/**
 * CLI manual: dispara UNA iteración del cron outbound.
 * Lee message_schedules pending vencidos, los manda a ManyChat (real),
 * marca sent/failed/retry. Imprime el resumen.
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente run-outbound-tick
 *   pnpm --filter @fyzon/motor-agente run-outbound-tick --batch 5
 */
import { getSupabase } from '../src/lib/supabase.js';
import { sendNextBatch } from '../src/services/outbound-sender.js';

function parseArgs(argv: string[]): { batch: number } {
  let batch = 25;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--batch') batch = Number(argv[++i]);
  }
  return { batch };
}

async function main(): Promise<void> {
  const { batch } = parseArgs(process.argv);
  const supabase = getSupabase();
  const result = await sendNextBatch({ supabase }, batch);
  console.log('━'.repeat(78));
  console.log(`outbound batch — picked=${result.picked} sent=${result.sent} retried=${result.retried} failed=${result.failed} skipped=${result.skipped}`);
  console.log('━'.repeat(78));
  for (const d of result.details) {
    console.log(`  schedule=${d.scheduleId} → ${d.status}${d.error ? ` (${d.error})` : ''}`);
  }
}

main().catch((err) => {
  console.error('run-outbound-tick failed:', err);
  process.exit(1);
});
