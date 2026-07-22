#!/usr/bin/env node
/**
 * Build de Tania v4: compila core/ + variantes/ → dist/*.system.json listos para n8n.
 *
 * Uso:
 *   node prompts/tania/build/build-tania-v4.mjs            # compila las 4 variantes + seguimiento
 *   node prompts/tania/build/build-tania-v4.mjs --check    # solo valida, no escribe
 *
 * Salidas (dist/, versionadas en git):
 *   tania-v4-core.txt                       — el core concatenado (para lectura/diff)
 *   tania-v4-<variante>.system.json         — {variante, model, max_tokens, thinking, system:[core, fuente]}
 *   tania-v4-seguimiento.system.json        — system del workflow de seguimiento (Haiku)
 *
 * Reglas:
 *   - El bloque system[0] (core) es BYTE-IDÉNTICO en las 4 variantes → comparten caché.
 *   - Los enlaces (booking_url, whatsapp_fallback) viven en el frontmatter de cada variante
 *     y el build los inyecta como sección "Enlaces de esta fuente" del bloque system[1].
 *   - Patrón heredado de scripts/build-coach-v5-seed.mjs: stripFrontmatter + stripHtmlComments.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '..'); // prompts/tania
const CHECK_ONLY = process.argv.includes('--check');

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;
const CACHE = { type: 'ephemeral', ttl: '1h' };

function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  return m ? { front: m[1], body: m[2] } : { front: '', body: text };
}

function parseFront(front) {
  const out = {};
  for (const line of front.split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.+?)\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---- CORE (orden alfabético de fichero = orden 00..10) ----
const coreDir = join(BASE, 'core');
const coreFiles = readdirSync(coreDir).filter((f) => f.endsWith('.md')).sort();
if (coreFiles.length === 0) {
  console.error('ERROR: no hay ficheros en core/');
  process.exit(1);
}
const coreParts = coreFiles.map((f) => {
  const { body } = stripFrontmatter(readFileSync(join(coreDir, f), 'utf8'));
  return normalize(stripHtmlComments(body));
});
const coreText = coreParts.join('\n\n');

// Validaciones del core
const problems = [];
if (/\{\{[A-Z_]+\}\}/.test(coreText)) problems.push('El core contiene placeholders {{...}} sin resolver (deben vivir en las variantes).');
for (const tag of ['identidad', 'voz', 'memoria_y_datos', 'direccion', 'cualificacion', 'objeciones', 'recap_y_oferta', 'post_link', 'derivacion_y_cierres', 'etapas', 'output']) {
  if (!coreText.includes(`<${tag}>`) || !coreText.includes(`</${tag}>`)) problems.push(`Sección <${tag}> incompleta o ausente en el core.`);
}

// ---- VARIANTES ----
const varDir = join(BASE, 'variantes');
const variantFiles = readdirSync(varDir).filter((f) => f.endsWith('.md')).sort();
const distDir = join(BASE, 'dist');
mkdirSync(distDir, { recursive: true });

const built = [];
for (const f of variantFiles) {
  const raw = readFileSync(join(varDir, f), 'utf8');
  const { front, body } = stripFrontmatter(raw);
  const meta = parseFront(front);
  const name = meta.variante ?? f.replace(/\.md$/, '');
  if (!meta.booking_url) problems.push(`${f}: falta booking_url en frontmatter.`);
  if (!meta.whatsapp_fallback) problems.push(`${f}: falta whatsapp_fallback en frontmatter.`);
  if (meta.booking_url && !/^https:\/\/api\.leadconnectorhq\.com\/widget\/bookings\/[a-z0-9-]+$/i.test(meta.booking_url)) {
    problems.push(`${f}: booking_url con formato inesperado (${meta.booking_url}).`);
  }

  let variantText = normalize(stripHtmlComments(body));
  variantText += `\n\n<enlaces_de_esta_fuente>\n- ENLACE DE AGENDA (el único que envías, tal cual, en su propia burbuja): ${meta.booking_url}\n- WHATSAPP DE FALLBACK (solo cuando la agenda no tiene huecos): ${meta.whatsapp_fallback}\n</enlaces_de_esta_fuente>`;

  built.push({
    file: `tania-v4-${name}.system.json`,
    mdFile: `tania-v4-${name}.md`,
    // Concatenación plana (core + variante), SIN cache_control ni wrapper JSON:
    // esto es lo que se pega tal cual en el campo "System Message" de un nodo
    // Agente de n8n. El .system.json de arriba es para el nodo HTTP directo.
    plainText: `${coreText}\n\n${variantText}`,
    payload: {
      variante: name,
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: [
        { type: 'text', text: coreText, cache_control: CACHE },
        { type: 'text', text: variantText, cache_control: CACHE },
      ],
    },
  });
}

// ---- SEGUIMIENTO ----
const segRaw = readFileSync(join(BASE, 'seguimiento', 'system-seguimiento.md'), 'utf8');
const segText = normalize(stripHtmlComments(stripFrontmatter(segRaw).body));
built.push({
  file: 'tania-v4-seguimiento.system.json',
  mdFile: 'tania-v4-seguimiento.md',
  plainText: segText,
  payload: {
    variante: 'seguimiento',
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: [{ type: 'text', text: segText, cache_control: CACHE }],
  },
});

// ---- Report + write ----
const approxTokens = (s) => Math.round(s.length / 3.7); // castellano ≈ 3.7 chars/token
console.log(`core: ${coreFiles.length} secciones, ${coreText.length} chars (~${approxTokens(coreText)} tokens)`);
for (const b of built.filter((x) => x.payload.system.length === 2)) {
  const v = b.payload.system[1].text;
  console.log(`  ${b.payload.variante}: variante ${v.length} chars (~${approxTokens(v)} tok) → prefijo total ~${approxTokens(coreText) + approxTokens(v)} tok`);
}

if (problems.length) {
  console.error('\nPROBLEMAS:\n- ' + problems.join('\n- '));
  process.exit(1);
}

if (!CHECK_ONLY) {
  writeFileSync(join(distDir, 'tania-v4-core.txt'), coreText, 'utf8');
  for (const b of built) {
    writeFileSync(join(distDir, b.file), JSON.stringify(b.payload, null, 2), 'utf8');
    writeFileSync(join(distDir, b.mdFile), b.plainText, 'utf8');
  }
  const allFiles = built.flatMap((b) => [b.file, b.mdFile]);
  console.log(`\nOK → dist/: tania-v4-core.txt + ${allFiles.join(', ')}`);
} else {
  console.log('\nOK (--check, no se escribió nada)');
}
