#!/usr/bin/env node
// ============================================================
// build-core-v4-seed.mjs
// Lee los archivos fuente del Cerebro del Setter v4 (Core v4) y
// genera un SQL con INSERTs para public.prompt_blocks.
// ============================================================
// Diferencias vs v3:
//   - El v4 está fragmentado en N archivos, uno por block_key
//     (cada archivo trae su block_key y sort_order en el frontmatter
//     YAML). NO requiere split interno como el v3.
//   - El parser strip-ea: (a) frontmatter YAML, (b) comentarios HTML
//     `<!-- ... -->` que en v4 se usan como notas internas.
//   - Salta archivos prefijados con `_` (legacy, etc.) y `README.md`.
//
// Input:
//   prompts/source/core-v4/01-role.md
//   prompts/source/core-v4/02-fase-1.md … 07-fase-6.md
//   prompts/source/core-v4/08-objeciones.md
//   prompts/source/core-v4/09-descualificacion.md
//   prompts/source/core-v4/10-handoff.md
//   prompts/source/core-v4/11-output-contract.md
//
// Output:
//   schema/v1/seeds/007-core-v4-blocks.sql
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'prompts', 'source', 'core-v4');
const OUT_DIR = join(ROOT, 'schema', 'v1', 'seeds');
const OUT_FILE = join(OUT_DIR, '007-core-v4-blocks.sql');
const TAG = '$FyzonCoreV4Block$'; // dollar-quote string delimitador

mkdirSync(OUT_DIR, { recursive: true });

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

/**
 * Parsea el frontmatter YAML simple (claves de primer nivel) de un .md.
 * Devuelve { fm: { ...keys }, body: string }.
 * NO parsea listas ni maps anidados; solo claves "k: v" en raíz.
 */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) {
    throw new Error('No se encuentra frontmatter YAML (--- ... ---) al inicio del archivo');
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    // Solo líneas con clave a nivel raíz (sin indentación)
    const kv = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (kv) {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return { fm, body: m[2] };
}

/**
 * Elimina los comentarios HTML <!-- ... --> del cuerpo del archivo.
 * Esos comentarios son notas internas y NO van al prompt en runtime.
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Limpia espacios/saltos sobrantes tras strip de comentarios.
 */
function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ------------------------------------------------------------
// Listar archivos del Cerebro v4
// ------------------------------------------------------------
const files = readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !f.startsWith('_')) // saltar _legacy, _template, etc.
  .filter((f) => f !== 'README.md')
  .sort(); // orden alfabético: 01-role.md, 02-fase-1.md, ...

if (files.length === 0) {
  throw new Error(`No se encontraron archivos .md en ${SRC}`);
}

// ------------------------------------------------------------
// Parsear cada archivo y construir la lista de bloques
// ------------------------------------------------------------
const blocks = [];
for (const file of files) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const blockKey = fm.block_key;
  const sortOrder = parseInt(fm.sort_order, 10);
  if (!blockKey) {
    throw new Error(`Falta block_key en frontmatter de ${file}`);
  }
  if (Number.isNaN(sortOrder)) {
    throw new Error(`Falta o inválido sort_order en frontmatter de ${file}`);
  }
  const content = normalizeWhitespace(stripHtmlComments(body));
  if (!content || content.length < 50) {
    throw new Error(`Bloque '${blockKey}' (${file}) parece vacío o muy corto: ${content.length} chars`);
  }
  if (content.includes(TAG)) {
    throw new Error(`Bloque '${blockKey}' (${file}) contiene el tag ${TAG} literal. Cambia el tag.`);
  }
  blocks.push({ file, key: blockKey, sort: sortOrder, content });
}

// Ordenar por sort_order (no por nombre de archivo)
blocks.sort((a, b) => a.sort - b.sort);

// Validar block_keys únicos
const seen = new Set();
for (const b of blocks) {
  if (seen.has(b.key)) {
    throw new Error(`block_key duplicado: '${b.key}' aparece en múltiples archivos`);
  }
  seen.add(b.key);
}

// ------------------------------------------------------------
// Generar SQL
// ------------------------------------------------------------
const blockKeysQuoted = blocks.map((b) => `'${b.key}'`).join(', ');

let sql = `-- ============================================================
-- Seed 007 — Cerebro del Setter v4 (Core v4) Fyzon (compartido, tenant_id=NULL)
-- ============================================================
-- Carga los bloques del Cerebro v4 en prompt_blocks.
-- Estos bloques son compartidos por TODOS los trainers (tenant_id IS NULL).
-- Versión inicial = 1.
--
-- Generado automáticamente por scripts/build-core-v4-seed.mjs
-- Fuentes: prompts/source/core-v4/*.md (11 archivos)
-- NO editar manualmente. Editar las fuentes y regenerar.
--
-- Decisiones de arquitectura: D43–D52 (plan c-users-sotob-downloads-prompt-ejemplo-quirky-puffin.md).
-- Migration 008-deactivate-v3-activate-v4.sql desactiva el Core v3 anterior.
-- ============================================================

BEGIN;

-- Limpiar versiones previas del Cerebro v4 compartido (idempotente)
DELETE FROM public.prompt_blocks
 WHERE tenant_id IS NULL
   AND block_key IN (${blockKeysQuoted})
   AND version = 1;
`;

for (const b of blocks) {
  sql += `
-- ${b.key} (${b.content.length} chars) — fuente: ${b.file}
INSERT INTO public.prompt_blocks (tenant_id, channel_override, block_key, content, sort_order, version, is_active)
VALUES (NULL, NULL, '${b.key}', ${TAG}${b.content}${TAG}, ${b.sort}, 1, TRUE);
`;
}

sql += `
COMMIT;

-- Verificación
SELECT block_key, sort_order, version, is_active, LENGTH(content) AS chars
FROM public.prompt_blocks
WHERE tenant_id IS NULL
  AND block_key IN (${blockKeysQuoted})
ORDER BY sort_order;
`;

writeFileSync(OUT_FILE, sql, 'utf8');

console.log(`\n✅ SQL generado en: ${OUT_FILE}`);
console.log(`   Tamaño total: ${sql.length.toLocaleString()} bytes\n`);
console.log(`Resumen de bloques:`);
console.log(`  ${'block_key'.padEnd(22)} ${'sort'.padStart(4)}  ${'chars'.padStart(7)}  archivo`);
console.log(`  ${'-'.repeat(22)} ${'-'.repeat(4)}  ${'-'.repeat(7)}  ${'-'.repeat(24)}`);
for (const b of blocks) {
  console.log(
    `  ${b.key.padEnd(22)} ${String(b.sort).padStart(4)}  ${String(b.content.length).padStart(7)}  ${b.file}`,
  );
}
const total = blocks.reduce((sum, b) => sum + b.content.length, 0);
console.log(`  ${'-'.repeat(22)} ${'-'.repeat(4)}  ${'-'.repeat(7)}`);
console.log(`  ${'TOTAL'.padEnd(22)} ${''.padStart(4)}  ${String(total).padStart(7)}`);
