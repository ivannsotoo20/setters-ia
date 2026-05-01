#!/usr/bin/env node
/**
 * Genera el SQL seed de un coach_v3 por trainer.
 *
 * Uso:
 *   node scripts/build-coach-seed.mjs --trainer pablo-montenegro --tenant-slug montefit [--seed-number 004]
 *
 * Fuente:
 *   prompts/source/coach-v3/<trainer>.md
 *
 * Salida:
 *   schema/v1/seeds/<NNN>-coach-<trainer>.sql
 *
 * Patrón heredado de scripts/build-core-v3-seed.mjs:
 *   - cleanMarkdownEscape() normaliza backslash-escaping de markdown.
 *   - dollar-quoting con tag $FyzonCoachBlock$ para evitar conflictos de comillas.
 *   - idempotencia: DELETE WHERE tenant_id=X AND block_key='coach_v3' AND version=1 ANTES del INSERT.
 *   - Inserta en prompt_blocks con block_key='coach_v3', sort_order=5, version=1.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---- argv parsing ----
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.trainer || !args['tenant-slug']) {
  console.error(
    'ERROR: faltan args requeridos.\n' +
      'Uso: node scripts/build-coach-seed.mjs --trainer <slug> --tenant-slug <slug> [--seed-number 004]',
  );
  process.exit(1);
}

const trainerSlug = args.trainer;
const tenantSlug = args['tenant-slug'];
const seedNumber = args['seed-number'] ?? '004';

// ---- utilidades de limpieza heredadas del script del Core v3 ----
function cleanMarkdownEscape(text) {
  return text
    .replace(/\\&gt;/g, '>')
    .replace(/\\&lt;/g, '<')
    .replace(/\\&amp;/g, '&')
    .replace(/\\`/g, '`')
    .replace(/\\([#*_\-|.<>\\+(){}\[\]!=~/])/g, '$1');
}

// ---- lectura de la fuente ----
const sourcePath = join(ROOT, 'prompts', 'source', 'coach-v3', `${trainerSlug}.md`);

if (!existsSync(sourcePath)) {
  console.error(`ERROR: no existe la fuente ${sourcePath}`);
  process.exit(1);
}

const rawContent = readFileSync(sourcePath, 'utf-8');
const cleanContent = cleanMarkdownEscape(rawContent).trim();

// ---- validaciones ----
if (cleanContent.length < 50) {
  console.error(`ERROR: contenido demasiado corto (${cleanContent.length} chars, min 50)`);
  process.exit(1);
}

const DELIM = '$FyzonCoachBlock$';
if (cleanContent.includes(DELIM)) {
  console.error(
    `ERROR: el contenido incluye el tag delimitador ${DELIM}. Cambia el texto o el tag.`,
  );
  process.exit(1);
}

// ---- generacion SQL ----
const sqlPath = join(ROOT, 'schema', 'v1', 'seeds', `${seedNumber}-coach-${trainerSlug}.sql`);

const sql = `-- ============================================================================
-- Seed ${seedNumber}: coach_v3 del trainer '${trainerSlug}' para tenant slug '${tenantSlug}'
-- Fuente: prompts/source/coach-v3/${trainerSlug}.md
-- Regenerar con: node scripts/build-coach-seed.mjs --trainer ${trainerSlug} --tenant-slug ${tenantSlug}
-- Idempotente: DELETE + INSERT por (tenant_id, block_key='coach_v3', version=1).
-- ============================================================================

BEGIN;

DO $do$
DECLARE
  v_tenant_id integer;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = '${tenantSlug}';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant con slug=% no existe. Aplica primero el seed del tenant.', '${tenantSlug}';
  END IF;

  DELETE FROM public.prompt_blocks
  WHERE tenant_id = v_tenant_id AND block_key = 'coach_v3' AND version = 1;

  INSERT INTO public.prompt_blocks
    (tenant_id, channel_override, block_key, content, sort_order, version, is_active)
  VALUES
    (v_tenant_id, NULL, 'coach_v3', ${DELIM}${cleanContent}${DELIM}, 5, 1, TRUE);

  RAISE NOTICE 'coach_v3 cargado para tenant_id=% (slug=%), % chars',
    v_tenant_id, '${tenantSlug}', length(${DELIM}${cleanContent}${DELIM});
END
$do$;

COMMIT;

-- Verificacion
SELECT tenant_id, block_key, sort_order, version, is_active, length(content) AS chars
FROM public.prompt_blocks
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = '${tenantSlug}')
  AND block_key = 'coach_v3';
`;

writeFileSync(sqlPath, sql, 'utf-8');

console.log(`[build-coach-seed] OK`);
console.log(`  Fuente:  ${sourcePath}`);
console.log(`  Salida:  ${sqlPath}`);
console.log(`  Chars:   ${cleanContent.length}`);
console.log(`  Tag:     ${DELIM}`);
