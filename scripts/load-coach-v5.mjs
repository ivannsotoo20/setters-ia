#!/usr/bin/env node
/**
 * Carga un coach_v5 desde su .md fuente a Supabase, con snapshot de versión.
 *
 * Por qué existe: el pipeline documentado es `build-coach-v5-seed.mjs` → aplicar
 * el .sql. Eso funciona, pero obliga a pasar el bloque entero (30k+ chars) por
 * quien ejecute el SQL. Este script hace lo mismo leyendo del disco.
 *
 * Respeta la doctrina de CLAUDE.md:
 *   - Snapshot del contenido ANTERIOR en `prompt_block_versions` antes de tocar nada.
 *   - UPDATE in-place del row activo (o INSERT si no existía).
 *   - Snapshot del contenido NUEVO después.
 *   - Nunca toca bloques con tenant_id IS NULL (los compartidos).
 *
 * Uso:
 *   node scripts/load-coach-v5.mjs --trainer tania-duarte-matos [--dry]
 *
 * El `--dry` imprime lo que haría sin escribir. Úsalo siempre la primera vez.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  const out = { trainer: null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--trainer') out.trainer = argv[++i];
    else if (argv[i] === '--dry') out.dry = true;
  }
  if (!out.trainer) {
    console.error('Falta --trainer <slug>');
    process.exit(1);
  }
  return out;
}

/** Quita el frontmatter YAML y devuelve { meta, body }. */
function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { meta: {}, body: raw.trim() };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw.trim() };
  const metaRaw = raw.slice(3, end);
  const body = raw.slice(end + 4).trim();
  const meta = {};
  for (const line of metaRaw.split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body };
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

  const path = resolve(ROOT, 'prompts/source/coach-v5', `${args.trainer}.md`);
  const { meta, body } = splitFrontmatter(readFileSync(path, 'utf8'));

  const tenantSlug = meta.tenant_slug || args.trainer;
  if (meta.trainer && meta.trainer !== args.trainer) {
    console.error(
      `El frontmatter dice trainer='${meta.trainer}' pero el fichero es '${args.trainer}'.\n` +
        'Si no cuadran, se carga el coach equivocado bajo el slug equivocado. Abortado.',
    );
    process.exit(1);
  }
  if (!body.includes('<coach_block>')) {
    console.error('El cuerpo no contiene <coach_block>. ¿Fichero equivocado? Abortado.');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .select('id, name')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (tErr) throw new Error(`lookup tenant: ${tErr.message}`);
  if (!tenant) throw new Error(`No existe tenant con slug='${tenantSlug}'`);

  const { data: existing, error: eErr } = await db
    .from('prompt_blocks')
    .select('id, content')
    .eq('tenant_id', tenant.id)
    .eq('block_key', 'coach_v5')
    .eq('is_active', true)
    .maybeSingle();
  if (eErr) throw new Error(`lookup prompt_block: ${eErr.message}`);

  console.log(`tenant   : ${tenant.name} (id=${tenant.id}, slug=${tenantSlug})`);
  console.log(`fichero  : ${path}`);
  console.log(`bloque   : ${body.length} chars`);
  console.log(`actual   : ${existing ? `${existing.content.length} chars (id=${existing.id})` : 'no existe'}`);

  if (existing && existing.content === body) {
    console.log('\nSin cambios: el contenido en BD ya es idéntico. Nada que hacer.');
    return;
  }
  if (args.dry) {
    console.log('\n--dry: no se ha escrito nada.');
    return;
  }

  let blockId = existing?.id ?? null;

  if (existing) {
    // 1) Snapshot del contenido ANTERIOR, para poder volver atrás.
    const { data: vs } = await db
      .from('prompt_block_versions')
      .select('version_number')
      .eq('prompt_block_id', existing.id)
      .order('version_number', { ascending: false })
      .limit(1);
    const lastVersion = vs?.[0]?.version_number ?? 0;

    if (lastVersion === 0) {
      await db.from('prompt_block_versions').insert({
        prompt_block_id: existing.id,
        version_number: 1,
        content: existing.content,
        change_summary: 'snapshot automatico del contenido previo (load-coach-v5)',
        was_applied: true,
      });
    }

    const { error: uErr } = await db
      .from('prompt_blocks')
      .update({ content: body, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (uErr) throw new Error(`update prompt_block: ${uErr.message}`);

    const nextVersion = Math.max(lastVersion, 1) + 1;
    await db.from('prompt_block_versions').insert({
      prompt_block_id: existing.id,
      version_number: nextVersion,
      content: body,
      change_summary: `carga desde ${args.trainer}.md (load-coach-v5)`,
      was_applied: true,
    });
    console.log(`\nOK: bloque actualizado. Snapshot v${nextVersion} guardado.`);
  } else {
    const { data: inserted, error: iErr } = await db
      .from('prompt_blocks')
      .insert({
        tenant_id: tenant.id,
        block_key: 'coach_v5',
        content: body,
        sort_order: 5,
        version: 1,
        is_active: true,
      })
      .select('id')
      .single();
    if (iErr) throw new Error(`insert prompt_block: ${iErr.message}`);
    blockId = inserted.id;

    await db.from('prompt_block_versions').insert({
      prompt_block_id: blockId,
      version_number: 1,
      content: body,
      change_summary: `carga inicial desde ${args.trainer}.md (load-coach-v5)`,
      was_applied: true,
    });
    console.log(`\nOK: bloque creado (id=${blockId}). Snapshot v1 guardado.`);
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
