#!/usr/bin/env tsx
/**
 * CLI de inspeccion: compone el system prompt con el composer real contra
 * Supabase y lo imprime con un resumen (por bloque, chars y cache).
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 2
 *   pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 4 --qualification
 *   pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 6 --handoff --pipeline
 *
 * Flags:
 *   --tenant <id>        (requerido)
 *   --phase <1..6>       (requerido)
 *   --qualification      incluye cualificacion_v3
 *   --handoff            incluye handoff_v3
 *   --pipeline           incluye pipeline_v3
 *   --no-objections      excluye objeciones_v3
 *   --cache <two-point|single-point|none>  estrategia de cache (default two-point)
 *   --full               imprime todo el contenido de cada bloque en lugar del preview
 */
import { composePrompt } from '@fyzon/prompt-composer';
import { getSupabase } from '../src/lib/supabase.js';

interface Argv {
  tenant?: number;
  phase?: number;
  qualification: boolean;
  handoff: boolean;
  pipeline: boolean;
  objections: boolean;
  cache: 'two-point' | 'single-point' | 'none';
  full: boolean;
}

function parseArgs(argv: string[]): Argv {
  const out: Argv = {
    qualification: false,
    handoff: false,
    pipeline: false,
    objections: true,
    cache: 'two-point',
    full: false,
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
      case '--qualification':
        out.qualification = true;
        break;
      case '--handoff':
        out.handoff = true;
        break;
      case '--pipeline':
        out.pipeline = true;
        break;
      case '--no-objections':
        out.objections = false;
        break;
      case '--cache': {
        const v = argv[++i] as Argv['cache'];
        if (!['two-point', 'single-point', 'none'].includes(v)) {
          throw new Error(`--cache must be two-point|single-point|none, got ${v}`);
        }
        out.cache = v;
        break;
      }
      case '--full':
        out.full = true;
        break;
      default:
        // ignora flags desconocidas
        break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.tenant === undefined || args.phase === undefined) {
    console.error('Uso: preview-prompt --tenant <id> --phase <1..6> [flags]');
    process.exit(1);
  }

  const supabase = getSupabase();

  const composed = await composePrompt(supabase, {
    tenantId: args.tenant,
    currentPhase: args.phase,
    isQualification: args.qualification,
    isHandoff: args.handoff,
    includePipeline: args.pipeline,
    includeObjections: args.objections,
    cacheStrategy: args.cache,
  });

  const { metadata, blocks } = composed;

  console.log('');
  console.log('='.repeat(78));
  console.log(
    `Prompt compuesto para tenant=${metadata.tenantId} phase=${metadata.currentPhase}`,
  );
  console.log('='.repeat(78));
  console.log(
    `Bloques: ${metadata.blockCount}   |   Chars total: ${metadata.totalChars.toLocaleString()}   |   Cache breakpoints: ${metadata.cacheBreakpoints}`,
  );
  console.log('');

  const rows = blocks.map((b, i) => ({
    '#': i + 1,
    key: b.key,
    scope: b.scope,
    chars: b.text.length.toLocaleString(),
    cached: b.cached ? 'YES' : '',
  }));
  console.table(rows);

  if (args.full) {
    console.log('');
    for (const b of blocks) {
      console.log('─'.repeat(78));
      console.log(`  ${b.key}  [${b.scope}]  ${b.cached ? '(cached)' : ''}`);
      console.log('─'.repeat(78));
      console.log(b.text);
    }
  } else {
    console.log('');
    console.log('Preview primeros 180 chars por bloque:');
    for (const b of blocks) {
      const snippet = b.text.replace(/\s+/g, ' ').slice(0, 180);
      console.log(`  [${b.key}] ${snippet}${b.text.length > 180 ? '...' : ''}`);
    }
  }
}

main().catch((err) => {
  console.error('preview-prompt failed:', err.message);
  process.exit(1);
});
