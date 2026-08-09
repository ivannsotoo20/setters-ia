#!/usr/bin/env node
/**
 * Actualiza IN-PLACE un bloque compartido del Cerebro v5 desde su .md fuente.
 *
 * Por qué existe: el camino documentado para el CORE es `pnpm core:build-seed` +
 * aplicar el .sql, pero ese seed hace DELETE + INSERT, así que el bloque cambia
 * de `id` y las filas de `prompt_block_versions` que lo referencian quedan
 * huérfanas: se pierde el histórico y con él el rollback. El otro camino
 * documentado es pegar el contenido a mano en un `execute_sql`, y son 53k chars
 * de markdown con comillas y dólares dentro — escaparlo a mano es pedir un
 * accidente.
 *
 * Este script hace lo que manda la doctrina de CLAUDE.md, leyendo del disco:
 *   1. Snapshot del contenido ANTERIOR en `prompt_block_versions` (idempotente).
 *   2. UPDATE in-place del row activo, conservando su `id`.
 *   3. Snapshot del contenido NUEVO.
 *
 * OJO: esto toca el cerebro COMPARTIDO (`tenant_id IS NULL`), así que afecta a
 * TODOS los tenants a la vez. No hay vuelta atrás automática: la hay manual,
 * copiando el contenido de la versión anterior desde `prompt_block_versions`.
 *
 * NO toca `prompt_blocks.version`: esa columna es la versión de ESQUEMA (v3/v4/v5)
 * y `composePrompt` filtra por `version = 1`. Subirla dejaría al setter sin cerebro.
 *
 * Uso:
 *   node scripts/load-core-v5.mjs --block core_v5_base --summary "que cambia" [--dry]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Los únicos bloques compartidos del Cerebro v5 y su fichero fuente. */
const BLOCKS = {
  core_v5_base: 'prompts/source/core-v5/01-core.md',
  output_contract_v5: 'prompts/source/core-v5/02-output-contract.md',
};

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // Sin .env.local: se asume que las vars ya están en el entorno.
  }
}

function parseArgs(argv) {
  const out = { block: null, summary: null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--block') out.block = argv[++i];
    else if (argv[i] === '--summary') out.summary = argv[++i];
    else if (argv[i] === '--dry') out.dry = true;
  }
  if (!out.block || !BLOCKS[out.block]) {
    console.error(`--block debe ser uno de: ${Object.keys(BLOCKS).join(', ')}`);
    process.exit(1);
  }
  if (!out.summary && !out.dry) {
    console.error('Falta --summary "<qué cambia>" (queda en el histórico y es lo que se lee al revertir).');
    process.exit(1);
  }
  return out;
}

/**
 * MISMA transformación que `scripts/build-core-v5-seed.mjs`: frontmatter fuera,
 * comentarios HTML fuera, saltos normalizados.
 *
 * Tiene que ser idéntica o las dos rutas de carga producen contenidos distintos
 * y cada una pisa a la otra. Sin el stripHtmlComments, la cabecera de
 * documentación del .md (~1.300 chars de metadatos de build) acabaría dentro del
 * prompt que se envía en cada llamada.
 */
function toBlockContent(raw) {
  const body = raw.startsWith('---')
    ? (() => {
        const end = raw.indexOf('\n---', 3);
        return end === -1 ? raw : raw.slice(end + 4);
      })()
    : raw;
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local o entorno).');
    process.exit(1);
  }

  const path = resolve(ROOT, BLOCKS[args.block]);
  const body = toBlockContent(readFileSync(path, 'utf8'));

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: block, error: bErr } = await db
    .from('prompt_blocks')
    .select('id, content')
    .is('tenant_id', null)
    .eq('block_key', args.block)
    .eq('is_active', true)
    .maybeSingle();
  if (bErr) throw new Error(`lookup prompt_block: ${bErr.message}`);
  if (!block) throw new Error(`No existe bloque compartido activo con block_key='${args.block}'`);

  console.log(`bloque   : ${args.block} (id=${block.id}, COMPARTIDO — afecta a todos los tenants)`);
  console.log(`fichero  : ${path}`);
  console.log(`actual   : ${block.content.length} chars`);
  console.log(`nuevo    : ${body.length} chars`);

  if (block.content === body) {
    console.log('\nSin cambios: el contenido en BD ya es idéntico. Nada que hacer.');
    return;
  }
  if (args.dry) {
    console.log('\n--dry: no se ha escrito nada.');
    return;
  }

  // 1) Snapshot del contenido ANTERIOR. Idempotente: si ya existe, no duplica.
  const { data: vs } = await db
    .from('prompt_block_versions')
    .select('version_number')
    .eq('prompt_block_id', block.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const lastVersion = vs?.[0]?.version_number ?? 0;

  if (lastVersion === 0) {
    const { error } = await db.from('prompt_block_versions').insert({
      prompt_block_id: block.id,
      version_number: 1,
      content: block.content,
      change_summary: 'snapshot automatico del contenido previo (load-core-v5)',
      was_applied: true,
    });
    if (error) throw new Error(`snapshot previo: ${error.message}`);
  }

  // 2) UPDATE in-place, conservando el id (y con el las referencias del histórico).
  const { error: uErr } = await db
    .from('prompt_blocks')
    .update({ content: body, updated_at: new Date().toISOString() })
    .eq('id', block.id);
  if (uErr) throw new Error(`update prompt_block: ${uErr.message}`);

  // 3) Snapshot del contenido NUEVO. Se inserta `body` directamente y no releyendo
  //    el row: releerlo es la carrera documentada en CLAUDE.md que en el Sprint 2.6
  //    guardo el contenido viejo bajo el numero de version nuevo.
  const nextVersion = Math.max(lastVersion, 1) + 1;
  const { error: sErr } = await db.from('prompt_block_versions').insert({
    prompt_block_id: block.id,
    version_number: nextVersion,
    content: body,
    change_summary: args.summary,
    was_applied: true,
  });
  if (sErr) throw new Error(`snapshot nuevo: ${sErr.message}`);

  console.log(`\nOK: bloque actualizado. Snapshot v${nextVersion} guardado.`);
  console.log(`Revertir: copiar el content de prompt_block_versions v${Math.max(lastVersion, 1)} al bloque id=${block.id}.`);
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
