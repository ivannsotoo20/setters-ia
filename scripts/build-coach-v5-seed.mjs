#!/usr/bin/env node
/**
 * Genera el SQL seed de un coach_v5 por trainer.
 *
 * Uso:
 *   node scripts/build-coach-v5-seed.mjs --trainer pablo-montenegro --tenant-slug montefit-pablo --seed-number 009
 *
 * Fuente:
 *   prompts/source/coach-v5/<trainer>.md
 *
 * Salida:
 *   schema/v1/seeds/<NNN>-coach-v5-<trainer>.sql
 *
 * Patrón heredado de scripts/build-coach-seed.mjs (v3):
 *   - cleanMarkdownEscape() normaliza backslash-escaping de markdown.
 *   - dollar-quoting con tag $FyzonCoachV5Block$ para evitar conflictos de comillas.
 *   - idempotencia: DELETE WHERE tenant_id=X AND block_key='coach_v5' AND version=1 ANTES del INSERT.
 *   - Inserta en prompt_blocks con block_key='coach_v5', sort_order=5, version=1.
 *
 * Cambios vs v3 (Sprint Iota.2, 2026-05-18):
 *   - Path origen: coach-v5/ en vez de coach-v3/.
 *   - block_key: coach_v5 en vez de coach_v3.
 *   - Strip frontmatter YAML al inicio del .md (el v5 usa frontmatter, el v3 no).
 *   - Strip comentarios HTML `<!-- ... -->`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
      'Uso: node scripts/build-coach-v5-seed.mjs --trainer <slug> --tenant-slug <slug> [--seed-number 009]',
  );
  process.exit(1);
}

const trainerSlug = args.trainer;
const tenantSlug = args['tenant-slug'];
const seedNumber = args['seed-number'] ?? '009';

function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return m ? m[1] : text;
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function cleanMarkdownEscape(text) {
  return text
    .replace(/\\&gt;/g, '>')
    .replace(/\\&lt;/g, '<')
    .replace(/\\&amp;/g, '&')
    .replace(/\\`/g, '`')
    .replace(/\\([#*_\-|.<>\\+(){}\[\]!=~/])/g, '$1');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const sourcePath = join(ROOT, 'prompts', 'source', 'coach-v5', `${trainerSlug}.md`);

if (!existsSync(sourcePath)) {
  console.error(`ERROR: no existe la fuente ${sourcePath}`);
  process.exit(1);
}

const rawContent = readFileSync(sourcePath, 'utf-8');
const cleanContent = normalizeWhitespace(
  stripHtmlComments(cleanMarkdownEscape(stripFrontmatter(rawContent))),
);

if (cleanContent.length < 50) {
  console.error(`ERROR: contenido demasiado corto (${cleanContent.length} chars, min 50)`);
  process.exit(1);
}

const DELIM = '$FyzonCoachV5Block$';
if (cleanContent.includes(DELIM)) {
  console.error(
    `ERROR: el contenido incluye el tag delimitador ${DELIM}. Cambia el texto o el tag.`,
  );
  process.exit(1);
}

const sqlPath = join(ROOT, 'schema', 'v1', 'seeds', `${seedNumber}-coach-v5-${trainerSlug}.sql`);

const sql = `-- ============================================================================
-- Seed ${seedNumber}: coach_v5 del trainer '${trainerSlug}' para tenant slug '${tenantSlug}'
-- Fuente: prompts/source/coach-v5/${trainerSlug}.md
-- Regenerar con: node scripts/build-coach-v5-seed.mjs --trainer ${trainerSlug} --tenant-slug ${tenantSlug}
-- Idempotente: DELETE + INSERT por (tenant_id, block_key='coach_v5', version=1).
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
  WHERE tenant_id = v_tenant_id AND block_key = 'coach_v5' AND version = 1;

  INSERT INTO public.prompt_blocks
    (tenant_id, channel_override, block_key, content, sort_order, version, is_active)
  VALUES
    (v_tenant_id, NULL, 'coach_v5', ${DELIM}${cleanContent}${DELIM}, 5, 1, TRUE);

  -- Snapshot inicial v=1 en prompt_block_versions (auditoría histórica)
  INSERT INTO public.prompt_block_versions (
    prompt_block_id, version_number, content, change_summary, was_applied, changed_at
  )
  SELECT pb.id, 1, pb.content,
    'coach_v5 — carga inicial Sprint Iota.2 (${trainerSlug})',
    TRUE, now()
  FROM public.prompt_blocks pb
  WHERE pb.tenant_id = v_tenant_id AND pb.block_key = 'coach_v5' AND pb.version = 1
  ON CONFLICT (prompt_block_id, version_number) DO NOTHING;

  RAISE NOTICE 'coach_v5 cargado para tenant_id=% (slug=%), % chars',
    v_tenant_id, '${tenantSlug}', length(${DELIM}${cleanContent}${DELIM});
END
$do$;

COMMIT;

-- Verificacion
SELECT tenant_id, block_key, sort_order, version, is_active, length(content) AS chars
FROM public.prompt_blocks
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = '${tenantSlug}')
  AND block_key = 'coach_v5';
`;

writeFileSync(sqlPath, sql, 'utf-8');

console.log(`[build-coach-v5-seed] OK`);
console.log(`  Fuente:  ${sourcePath}`);
console.log(`  Salida:  ${sqlPath}`);
console.log(`  Chars:   ${cleanContent.length}`);
console.log(`  Tag:     ${DELIM}`);
