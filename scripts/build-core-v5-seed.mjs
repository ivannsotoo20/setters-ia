#!/usr/bin/env node
// ============================================================
// build-core-v5-seed.mjs
// Lee los archivos fuente del Cerebro del Setter v5 (consolidado)
// y genera un SQL con INSERTs para public.prompt_blocks.
// ============================================================
// Cerebro v5 (Sprint Iota.1, 2026-05-18):
//   - 2 bloques shared: core_v5_base (sort=0) + output_contract_v5 (sort=100)
//   - Reemplaza los 11 bloques v4 que existían antes (core_v4_base, 6 × fase_N_v4,
//     objeciones_v4, descualificacion_v4, handoff_v4, output_contract_v4)
//
// Parser idéntico al de v4: cada .md trae block_key y sort_order en frontmatter YAML.
// Strippea (a) frontmatter YAML, (b) comentarios HTML <!-- ... -->. Salta archivos
// prefijados con `_` y README.md.
//
// Input:
//   prompts/source/core-v5/01-core.md
//   prompts/source/core-v5/02-output-contract.md
//
// Output:
//   schema/v1/seeds/008-core-v5-blocks.sql
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'prompts', 'source', 'core-v5');
const OUT_DIR = join(ROOT, 'schema', 'v1', 'seeds');
const OUT_FILE = join(OUT_DIR, '008-core-v5-blocks.sql');
const TAG = '$FyzonCoreV5Block$'; // dollar-quote string delimitador

mkdirSync(OUT_DIR, { recursive: true });

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) {
    throw new Error('No se encuentra frontmatter YAML (--- ... ---) al inicio del archivo');
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (kv) {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return { fm, body: m[2] };
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const files = readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !f.startsWith('_'))
  .filter((f) => f !== 'README.md')
  .sort();

if (files.length === 0) {
  throw new Error(`No se encontraron archivos .md en ${SRC}`);
}

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

blocks.sort((a, b) => a.sort - b.sort);

const seen = new Set();
for (const b of blocks) {
  if (seen.has(b.key)) {
    throw new Error(`block_key duplicado: '${b.key}' aparece en múltiples archivos`);
  }
  seen.add(b.key);
}

const blockKeysQuoted = blocks.map((b) => `'${b.key}'`).join(', ');

let sql = `-- ============================================================
-- Seed 008 — Cerebro del Setter v5 (consolidado) Fyzon (compartido, tenant_id=NULL)
-- ============================================================
-- Carga los bloques del Cerebro v5 en prompt_blocks.
-- Estos bloques son compartidos por TODOS los trainers (tenant_id IS NULL).
-- Versión inicial = 1.
--
-- Generado automáticamente por scripts/build-core-v5-seed.mjs
-- Fuentes: prompts/source/core-v5/*.md (2 archivos)
-- NO editar manualmente. Editar las fuentes y regenerar.
--
-- Migration 058-cerebro-v5-shared-blocks.sql desactiva los 11 bloques v4 anteriores
-- y carga estos 2 nuevos en una sola transacción.
-- ============================================================

BEGIN;

-- Limpiar versiones previas del Cerebro v5 compartido (idempotente)
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
