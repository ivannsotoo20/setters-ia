#!/usr/bin/env node
// ============================================================
// build-core-v3-seed.mjs
// Lee los archivos fuente del Core v3 Fyzon (markdown escapado) y
// genera un SQL con INSERTs para public.prompt_blocks.
// ============================================================
// Input:
//   prompts/source/core-v3/01-plantilla-base-v2.md
//   prompts/source/core-v3/02-fases-setting.md
//   prompts/source/core-v3/03-bloque-7-ram.md
//
// Output:
//   schema/v1/seeds/002-core-v3-blocks.sql
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'prompts', 'source', 'core-v3');
const OUT_DIR = join(ROOT, 'schema', 'v1', 'seeds');
const OUT_FILE = join(OUT_DIR, '002-core-v3-blocks.sql');
const TAG = '$FyzonCoreV3Block$'; // dollar-quote string delimitador

mkdirSync(OUT_DIR, { recursive: true });

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

/**
 * Limpia el escape markdown que viene de Google Docs / pegados:
 * quita los `\` antes de caracteres especiales como # * _ - | . < > etc.
 * También normaliza `\&gt;` → `>`.
 */
function cleanMarkdownEscape(text) {
  return text
    .replace(/\\&gt;/g, '>')
    .replace(/\\&lt;/g, '<')
    .replace(/\\&amp;/g, '&')
    .replace(/\\`/g, '`')
    // backslash antes de caracteres especiales de markdown/HTML escapados
    .replace(/\\([#*_\-|.<>\\+(){}[\]!=~\/])/g, '$1');
}

/**
 * Extrae una sección entre un marcador de inicio y uno final (exclusivo).
 * El marcador es un literal al comienzo de línea.
 */
function extractSection(text, startMarker, endMarker) {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`No encuentro sección '${startMarker}'`);
  }
  const afterStart = text.slice(startIdx);
  if (!endMarker) return afterStart.trim();
  const endIdx = afterStart.indexOf(endMarker);
  if (endIdx === -1) {
    throw new Error(`No encuentro final '${endMarker}' tras '${startMarker}'`);
  }
  return afterStart.slice(0, endIdx).trim();
}

// ------------------------------------------------------------
// Leer archivos fuente
// ------------------------------------------------------------
const rawCore = readFileSync(join(SRC, '01-plantilla-base-v2.md'), 'utf8');
const rawFases = readFileSync(join(SRC, '02-fases-setting.md'), 'utf8');
const rawRam = readFileSync(join(SRC, '03-bloque-7-ram.md'), 'utf8');

// Limpiar escape
const coreBase = cleanMarkdownEscape(rawCore).trim();
const fases = cleanMarkdownEscape(rawFases);
const objeciones = cleanMarkdownEscape(rawRam).trim();

// ------------------------------------------------------------
// Dividir el archivo de fases por secciones
// ------------------------------------------------------------
const fase1        = extractSection(fases, '# Fase 1',              '# Fase 2');
const fase2        = extractSection(fases, '# Fase 2',              '# Fase 3');
const fase3        = extractSection(fases, '# Fase 3',              '# Fase 4');
const fase4        = extractSection(fases, '# Fase 4',              '# Fase 5');
const fase5        = extractSection(fases, '# Fase 5',              '# Fase 6');
const fase6        = extractSection(fases, '# Fase 6',              '# Protocolo hand_off');
const handoff      = extractSection(fases, '# Protocolo hand_off',  '# Fases pipeline GHL');
const pipeline     = extractSection(fases, '# Fases pipeline GHL',  '# Fase cualificacion');
const cualificacion = extractSection(fases, '# Fase cualificacion', null);

// ------------------------------------------------------------
// Bloques a insertar
// ------------------------------------------------------------
const blocks = [
  { key: 'core_v3_base',      sort: 0,   content: coreBase },
  { key: 'fase_1_v3',         sort: 10,  content: fase1 },
  { key: 'fase_2_v3',         sort: 20,  content: fase2 },
  { key: 'fase_3_v3',         sort: 30,  content: fase3 },
  { key: 'fase_4_v3',         sort: 40,  content: fase4 },
  { key: 'fase_5_v3',         sort: 50,  content: fase5 },
  { key: 'fase_6_v3',         sort: 60,  content: fase6 },
  { key: 'cualificacion_v3',  sort: 70,  content: cualificacion },
  { key: 'handoff_v3',        sort: 80,  content: handoff },
  { key: 'pipeline_v3',       sort: 90,  content: pipeline },
  { key: 'objeciones_v3',     sort: 100, content: objeciones },
];

// Validación: ningún bloque debe contener el tag literal
for (const b of blocks) {
  if (b.content.includes(TAG)) {
    throw new Error(`El bloque '${b.key}' contiene el tag ${TAG} literal. Cambia el tag.`);
  }
  if (!b.content || b.content.length < 50) {
    throw new Error(`El bloque '${b.key}' parece vacío o muy corto (${b.content.length} chars)`);
  }
}

// ------------------------------------------------------------
// Generar SQL
// ------------------------------------------------------------
let sql = `-- ============================================================
-- Seed 002 — Core v3 Fyzon (compartido, tenant_id=NULL)
-- ============================================================
-- Carga los bloques del Core v3 en prompt_blocks.
-- Estos bloques son compartidos por TODOS los trainers (tenant_id IS NULL).
-- Versión inicial = 1.
--
-- Generado automáticamente por scripts/build-core-v3-seed.mjs
-- Fuentes: prompts/source/core-v3/*.md
-- NO editar manualmente. Editar las fuentes y regenerar.
-- ============================================================

BEGIN;

-- Limpiar versiones previas del Core v3 compartido (idempotente)
DELETE FROM public.prompt_blocks
 WHERE tenant_id IS NULL
   AND block_key IN (
     'core_v3_base','fase_1_v3','fase_2_v3','fase_3_v3','fase_4_v3',
     'fase_5_v3','fase_6_v3','cualificacion_v3','handoff_v3','pipeline_v3','objeciones_v3'
   )
   AND version = 1;
`;

for (const b of blocks) {
  sql += `
-- ${b.key} (${b.content.length} chars)
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
ORDER BY sort_order;
`;

writeFileSync(OUT_FILE, sql, 'utf8');

console.log(`\n✅ SQL generado en: ${OUT_FILE}`);
console.log(`   Tamaño total: ${sql.length.toLocaleString()} bytes\n`);
console.log(`Resumen de bloques:`);
console.log(`  ${'block_key'.padEnd(20)} ${'sort'.padStart(4)}  ${'chars'.padStart(7)}`);
console.log(`  ${'-'.repeat(20)} ${'-'.repeat(4)}  ${'-'.repeat(7)}`);
for (const b of blocks) {
  console.log(`  ${b.key.padEnd(20)} ${String(b.sort).padStart(4)}  ${String(b.content.length).padStart(7)}`);
}
const total = blocks.reduce((sum, b) => sum + b.content.length, 0);
console.log(`  ${'-'.repeat(20)} ${'-'.repeat(4)}  ${'-'.repeat(7)}`);
console.log(`  ${'TOTAL'.padEnd(20)} ${''.padStart(4)}  ${String(total).padStart(7)}`);
