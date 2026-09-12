#!/usr/bin/env node
/**
 * Carga versionada de un `coach_v5` desde su `.md` (2026-09-12).
 *
 * Es el flujo incremental del CLAUDE.md ("Editar prompts — 4 capas") hecho
 * script, para no pegar 40 KB de markdown en una query del MCP:
 *   1. Lee el .md, quita el frontmatter y toma el body (trim).
 *   2. Comprueba que el contenido en BD es el que esperas (--expect-md5) para
 *      no pisar una edición que no conoces. Sin --expect-md5, solo exige que
 *      el body sea distinto de lo que hay.
 *   3. Comprueba que la última `prompt_block_versions` es v_nueva - 1.
 *   4. UPDATE in-place del bloque activo.
 *   5. INSERT del snapshot v_nueva con el contenido del .md (no con un JOIN al
 *      row: la race condition del Sprint 2.6 dejaba el snapshot con el v_actual).
 *   6. Re-lee y verifica md5 del bloque y del snapshot.
 *
 *   node scripts/load-coach-v5-version.mjs \
 *     --tenant 7 --file prompts/source/coach-v5/tania-duarte-matos.md \
 *     --version 22 --expect-md5 e82f91ca89304f37ee84582812543aef \
 *     --summary "ronda TIEMPO + ZONA"
 *
 * Credenciales: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY del `.env.local` de la raíz.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
// supabase-js y dotenv viven en el motor; la raíz no los declara.
const require = createRequire(resolve(root, 'apps/motor-agente/package.json'));
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: resolve(root, '.env.local') });

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const md5 = (s) => createHash('md5').update(s).digest('hex');

const tenantId = Number(arg('tenant'));
const file = arg('file');
const newVersion = Number(arg('version'));
const expectMd5 = arg('expect-md5');
const summary = arg('summary') ?? `carga desde ${file}`;
if (!Number.isFinite(tenantId) || !file || !Number.isFinite(newVersion)) {
  console.error('uso: --tenant <id> --file <.md> --version <n> [--expect-md5 <md5>] [--summary "..."]');
  process.exit(2);
}

const raw = readFileSync(resolve(root, file), 'utf8');
const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
if (!fm) throw new Error('frontmatter YAML no encontrado en el .md');
const body = raw.slice(fm[0].length).trim();
console.log(`.md body: ${body.length} chars, md5 ${md5(body)}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: cur, error: e1 } = await supabase
  .from('prompt_blocks')
  .select('id, content, updated_at')
  .eq('tenant_id', tenantId)
  .eq('block_key', 'coach_v5')
  .eq('is_active', true)
  .single();
if (e1) throw e1;
const curMd5 = md5(cur.content);
console.log(`BD: prompt_blocks.id=${cur.id}, md5 ${curMd5}, ${cur.content.length} chars`);
if (expectMd5 && curMd5 !== expectMd5) {
  throw new Error(`el bloque en BD (${curMd5}) no es el esperado (${expectMd5}); abortando`);
}
if (curMd5 === md5(body)) {
  console.log('el .md ya coincide con BD; nada que hacer');
  process.exit(0);
}

const { data: vers, error: e2 } = await supabase
  .from('prompt_block_versions')
  .select('version_number')
  .eq('prompt_block_id', cur.id)
  .order('version_number', { ascending: false })
  .limit(1);
if (e2) throw e2;
const last = vers?.[0]?.version_number ?? 0;
if (last !== newVersion - 1) {
  throw new Error(`la última versión en historial es v${last}; esperaba v${newVersion - 1}`);
}

const { error: e3 } = await supabase
  .from('prompt_blocks')
  .update({ content: body, updated_at: new Date().toISOString() })
  .eq('id', cur.id)
  .eq('tenant_id', tenantId);
if (e3) throw e3;

const { error: e4 } = await supabase.from('prompt_block_versions').insert({
  prompt_block_id: cur.id,
  version_number: newVersion,
  content: body,
  change_summary: summary,
  was_applied: true,
  changed_at: new Date().toISOString(),
});
if (e4) throw e4;

const { data: after } = await supabase.from('prompt_blocks').select('content').eq('id', cur.id).single();
const { data: snap } = await supabase
  .from('prompt_block_versions')
  .select('content')
  .eq('prompt_block_id', cur.id)
  .eq('version_number', newVersion)
  .single();
const okBlock = md5(after.content) === md5(body);
const okSnap = md5(snap.content) === md5(body);
console.log(`verificación: bloque ${okBlock ? 'OK' : 'MAL'} (${md5(after.content)}), snapshot v${newVersion} ${okSnap ? 'OK' : 'MAL'}`);
if (!okBlock || !okSnap) process.exit(1);
