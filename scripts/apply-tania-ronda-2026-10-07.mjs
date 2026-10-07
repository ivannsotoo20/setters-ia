#!/usr/bin/env node
/**
 * Ronda de Tania del 2026-10-07: los tres pasos de BD, en orden y con sus
 * comprobaciones (docs/knowledge/project_tania_ronda_2026-10-07.md).
 *
 *   1. tenant_configs.lead_qualification (tenant 7): merge de `call_gate` y
 *      `allowed_price_text`. Merge, nunca reescritura: el resto de claves (zona,
 *      criterios del formulario, cierre) se conserva tal cual.
 *   2. Core v7 (`core_v5_base`, compartido) con scripts/load-core-v5.mjs. Solo si
 *      lo que hay en BD es exactamente el v6 del repo: si alguien lo editó a mano,
 *      se aborta en vez de pisarlo.
 *   3. Coach v29 de Tania con scripts/load-coach-v5-version.mjs, que exige que en
 *      BD esté el v28 (md5) y que la última versión del historial sea la 28.
 *
 * Sin --apply no escribe nada: enseña qué haría. Con --apply ejecuta los tres
 * pasos y para en el primero que falle.
 *
 *   node scripts/apply-tania-ronda-2026-10-07.mjs            # comprobación
 *   node scripts/apply-tania-ronda-2026-10-07.mjs --apply    # carga
 *
 * Credenciales: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY del `.env.local` de la raíz.
 * Requiere el motor desplegado (run 71 de deploy-motor, commit c5665db): sin él,
 * el Judge viejo quitaría el precio del coach v29.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/motor-agente/package.json'));
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: resolve(root, '.env.local') });

const APPLY = process.argv.includes('--apply');
const TENANT_ID = 7;
const CORE_FILE = 'prompts/source/core-v5/01-core.md';
/** Último commit con el Core v6 (el que está en BD desde el 2026-08-25). */
const CORE_V6_COMMIT = '02f6a44';
const COACH_FILE = 'prompts/source/coach-v5/tania-duarte-matos.md';
/** md5 del coach v28 en BD (cargado desde Windows, saltos CRLF). */
const COACH_V28_MD5 = '0a1c69b752a4c8f83353922aa12f0a97';

const CONFIG_MERGE = {
  call_gate: { require_country: true, min_pain_months: 3 },
  allowed_price_text: 'entre 600 y 1.200€',
};

const md5 = (s) => createHash('md5').update(s).digest('hex');

/** Misma transformación que load-core-v5.mjs: sin frontmatter ni comentarios, LF. */
function coreBlockContent(raw) {
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

function runNode(args) {
  const res = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`falló: node ${args.join(' ')}`);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(APPLY ? '== MODO CARGA (--apply) ==\n' : '== MODO COMPROBACIÓN (sin --apply no se escribe nada) ==\n');

// --- 1. Config del tenant ----------------------------------------------------
{
  const { data, error } = await db
    .from('tenant_configs')
    .select('lead_qualification')
    .eq('tenant_id', TENANT_ID)
    .single();
  if (error) throw new Error(`tenant_configs: ${error.message}`);
  const current = data.lead_qualification ?? {};
  if (!current.zone_allowlist) {
    throw new Error('el tenant 7 no tiene zone_allowlist: el cerrojo no podría exigir el país; abortando');
  }
  console.log('1. lead_qualification (tenant 7)');
  console.log(`   call_gate actual         : ${JSON.stringify(current.call_gate ?? null)}`);
  console.log(`   allowed_price_text actual: ${JSON.stringify(current.allowed_price_text ?? null)}`);
  console.log(`   → nuevo: ${JSON.stringify(CONFIG_MERGE)}`);
  const already =
    JSON.stringify(current.call_gate) === JSON.stringify(CONFIG_MERGE.call_gate) &&
    current.allowed_price_text === CONFIG_MERGE.allowed_price_text;
  if (already) {
    console.log('   ya estaba así; nada que hacer\n');
  } else if (APPLY) {
    const merged = { ...current, ...CONFIG_MERGE };
    const { data: upd, error: uErr } = await db
      .from('tenant_configs')
      .update({ lead_qualification: merged })
      .eq('tenant_id', TENANT_ID)
      .select('tenant_id, lead_qualification');
    if (uErr) throw new Error(`update tenant_configs: ${uErr.message}`);
    if (!upd || upd.length !== 1) throw new Error(`se esperaba 1 fila actualizada, hubo ${upd?.length ?? 0}`);
    const lq = upd[0].lead_qualification;
    const keptKeys = Object.keys(current).every((k) => k in lq);
    console.log(`   OK: actualizado (claves previas conservadas: ${keptKeys ? 'sí' : 'NO'})\n`);
    if (!keptKeys) throw new Error('se perdió alguna clave previa de lead_qualification');
  } else {
    console.log('   (se aplicaría con --apply)\n');
  }
}

// --- 2. Core v7 ---------------------------------------------------------------
{
  const v7 = coreBlockContent(readFileSync(resolve(root, CORE_FILE), 'utf8'));
  const v6 = coreBlockContent(
    execFileSync('git', ['show', `${CORE_V6_COMMIT}:${CORE_FILE}`], { cwd: root, encoding: 'utf8' }),
  );
  const { data: core, error } = await db
    .from('prompt_blocks')
    .select('id, content')
    .is('tenant_id', null)
    .eq('block_key', 'core_v5_base')
    .eq('is_active', true)
    .single();
  if (error) throw new Error(`core_v5_base: ${error.message}`);
  const dbContent = core.content.replace(/\r\n/g, '\n').trim();
  console.log(`2. core_v5_base (id=${core.id}): BD ${core.content.length} chars · v6 ${v6.length} · v7 ${v7.length}`);
  if (dbContent === v7) {
    console.log('   ya está el v7; nada que hacer\n');
  } else if (dbContent !== v6) {
    throw new Error(
      'el Core en BD no es el v6 del repo (alguien lo editó fuera del .md); no se pisa. ' +
        'Revisar la diferencia antes de cargar.',
    );
  } else if (APPLY) {
    runNode([
      'scripts/load-core-v5.mjs',
      '--block',
      'core_v5_base',
      '--summary',
      'v7 (2026-10-07): CR2 admite el literal de precio autorizado por el coach (Tania)',
    ]);
    console.log('');
  } else {
    console.log('   en BD está el v6: se cargaría el v7 con --apply\n');
  }
}

// --- 3. Coach v29 ---------------------------------------------------------------
{
  const { data: coach, error } = await db
    .from('prompt_blocks')
    .select('id, content')
    .eq('tenant_id', TENANT_ID)
    .eq('block_key', 'coach_v5')
    .eq('is_active', true)
    .single();
  if (error) throw new Error(`coach_v5: ${error.message}`);
  const { data: vers } = await db
    .from('prompt_block_versions')
    .select('version_number')
    .eq('prompt_block_id', coach.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const last = vers?.[0]?.version_number ?? 0;
  const curMd5 = md5(coach.content);
  console.log(`3. coach_v5 de Tania (id=${coach.id}): md5 ${curMd5}, última versión v${last}`);
  const raw = readFileSync(resolve(root, COACH_FILE), 'utf8');
  const body = raw.slice(raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)[0].length).trim();
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const isV29 = lf(coach.content) === lf(body);
  if (isV29) {
    console.log('   ya está el v29; nada que hacer\n');
  } else if (curMd5 !== COACH_V28_MD5 || last !== 28) {
    throw new Error(`en BD no está el v28 esperado (md5 ${COACH_V28_MD5}, v28); no se pisa`);
  } else if (APPLY) {
    runNode([
      'scripts/load-coach-v5-version.mjs',
      '--tenant',
      String(TENANT_ID),
      '--file',
      COACH_FILE,
      '--version',
      '29',
      '--expect-md5',
      COACH_V28_MD5,
      '--summary',
      'v29 (2026-10-07): videollamada para valorar si puedo ayudarte, precio en dos literales, respuestas de servicio, recursos',
    ]);
    console.log('');
  } else {
    console.log('   en BD está el v28: se cargaría el v29 con --apply\n');
  }
}

console.log(APPLY ? 'Hecho.' : 'Comprobación terminada. Si todo está bien, repite con --apply.');
