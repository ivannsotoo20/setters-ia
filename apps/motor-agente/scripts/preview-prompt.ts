#!/usr/bin/env tsx
/**
 * CLI de inspeccion: compone el system prompt con el composer real contra
 * Supabase y lo imprime con un resumen (por bloque, chars y cache).
 *
 * Cerebro v5: ya no se eligen bloques por fase ni por flags. El composer
 * carga siempre `core_v5_base` + `coach_v5` + `admin_overrides_v1?` +
 * `output_contract_v5` + `trainer_prefs_v1?`. El marker de fase activa pasa
 * por `currentPhaseFocus` (inyectado por el motor desde phase-focus.ts).
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 2
 *   pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 6 --handoff
 *
 * Flags:
 *   --tenant <id>        (requerido)
 *   --phase <1..6>       (requerido)
 *   --handoff            usa la instrucción focal de handoff
 *   --cache <two-point|single-point|none>  estrategia de cache (default two-point)
 *   --full               imprime todo el contenido de cada bloque en lugar del preview
 */
import { composePrompt } from '@fyzon/prompt-composer';
import { getSupabase } from '../src/lib/supabase.js';
import { buildPhaseFocusInstruction } from '../src/lib/phase-focus.js';

interface Argv {
  tenant?: number;
  phase?: number;
  handoff: boolean;
  cache: 'two-point' | 'single-point' | 'none';
  full: boolean;
}

function parseArgs(argv: string[]): Argv {
  const out: Argv = {
    handoff: false,
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
      case '--handoff':
        out.handoff = true;
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
    currentPhaseFocus: buildPhaseFocusInstruction(args.phase, args.handoff),
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
