#!/usr/bin/env node
/**
 * Suite de regresión Tania v4 — corre los fixtures de sesiones/ contra la API de Anthropic.
 *
 * Uso:
 *   node run-regression.mjs                         # corre todos los fixtures
 *   node run-regression.mjs --only 010              # solo fixtures cuyo id contenga "010"
 *   node run-regression.mjs --dry                   # imprime los requests sin llamar a la API
 *   node run-regression.mjs --model claude-sonnet-5 # override del modelo del dist
 *
 * Requiere: Node >= 20 (fetch nativo), env ANTHROPIC_API_KEY (salvo --dry).
 * Los dist se generan con build/build-tania-v4.mjs → prompts/tania/dist/tania-v4-<variante>.system.json
 * Respuestas crudas: fixtures/.results/<fixture-id>.json (gitignored).
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const SESIONES_DIR = join(FIXTURES_DIR, 'sesiones');
const TOOLS_DIR = join(FIXTURES_DIR, '..', 'tools');
const DIST_DIR = join(FIXTURES_DIR, '..', 'dist');
const RESULTS_DIR = join(FIXTURES_DIR, '.results');

const API_URL = 'https://api.anthropic.com/v1/messages';
const DELAY_MS = 500;
const VARIANTES = ['wa-outbound', 'wa-inbound-leadform', 'ig-inbound', 'ig-bienvenidas'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
const modelIdx = argv.indexOf('--model');
const MODEL_OVERRIDE = modelIdx >= 0 ? argv[modelIdx + 1] : null;

if (onlyIdx >= 0 && !ONLY) die('--only requiere un valor (ej: --only 010)');
if (modelIdx >= 0 && !MODEL_OVERRIDE) die('--model requiere un valor (ej: --model claude-sonnet-5)');

function die(msg) {
  console.error(`\n[ERROR] ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Carga de contratos
// ---------------------------------------------------------------------------
function loadJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`No pude leer/parsear ${what} en ${path}: ${err.message}`);
  }
}

const toolSchemaRaw = loadJson(join(TOOLS_DIR, 'responder_lead.schema.json'), 'el tool schema');
// La API de Anthropic acepta name/description/input_schema; "strict" es metadato local.
const TOOL = {
  name: toolSchemaRaw.name,
  description: toolSchemaRaw.description,
  input_schema: toolSchemaRaw.input_schema,
};
const ETAPAS_FOCO = loadJson(join(TOOLS_DIR, 'etapas-foco.json'), 'etapas-foco');

const distCache = new Map();
function loadDist(variante) {
  if (distCache.has(variante)) return distCache.get(variante);
  const path = join(DIST_DIR, `tania-v4-${variante}.system.json`);
  if (!existsSync(path)) {
    distCache.set(variante, null);
    return null;
  }
  const dist = loadJson(path, `el dist de la variante ${variante}`);
  distCache.set(variante, dist);
  return dist;
}

// ---------------------------------------------------------------------------
// Bloque <estado_conversacion>
// ---------------------------------------------------------------------------
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function buildEstadoBlock(estado) {
  const fecha = estado.fecha || new Date().toISOString().slice(0, 10);
  const dia = DIAS_SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
  const stage = estado.stage;
  const foco = ETAPAS_FOCO[stage];
  if (!foco) die(`Etapa desconocida "${stage}" (no está en etapas-foco.json)`);

  const slots = estado.slots || {};
  const slotLines = Object.entries(slots)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${v}`);
  const datos = slotLines.length ? slotLines.join('\n') : '- (aún ninguno)';

  const link = estado.link_enviado_fecha ? `enviado el ${estado.link_enviado_fecha}` : 'no enviado';

  const BOOKING = {
    none: 'sin reserva',
    reservada: 'reservada',
    no_show: 'no acudió',
    no_acudio: 'no acudió',
    cancelada: 'cancelada',
  };
  const reserva = BOOKING[estado.booking_status ?? 'none'];
  if (!reserva) die(`booking_status desconocido "${estado.booking_status}"`);

  return [
    '<estado_conversacion>',
    `FECHA: ${fecha} (${dia})`,
    `ETAPA: ${stage}`,
    `FOCO: ${foco}`,
    'DATOS CONFIRMADOS (PROHIBIDO re-preguntar):',
    datos,
    `LINK DE AGENDA: ${link}`,
    `RESERVA: ${reserva}`,
    '</estado_conversacion>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------
function buildMessages(fixture) {
  const merged = [];
  for (const turn of fixture.historial || []) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      // Defensa: la API no admite roles consecutivos iguales → fusionamos.
      last.content += `\n${turn.content}`;
    } else {
      merged.push({ role: turn.role, content: turn.content });
    }
  }
  const estadoBlock = buildEstadoBlock(fixture.estado);
  const lastUser = {
    role: 'user',
    content: [
      { type: 'text', text: estadoBlock },
      { type: 'text', text: fixture.mensaje_lead },
    ],
  };
  const prev = merged[merged.length - 1];
  if (prev && prev.role === 'user') {
    // El estado debe ser el PRIMER bloque del ÚLTIMO turno user: absorbemos el texto previo en el historial no es válido,
    // así que lo convertimos en bloque adicional tras el estado y antes del mensaje del lead.
    merged.pop();
    lastUser.content.splice(1, 0, { type: 'text', text: prev.content });
  }
  merged.push(lastUser);
  return merged;
}

function buildRequest(fixture, dist) {
  const system = dist
    ? dist.system
    : [{ type: 'text', text: '<PLACEHOLDER — dist no generado. Ejecuta build/build-tania-v4.mjs>' }];
  return {
    model: MODEL_OVERRIDE || (dist ? dist.model : 'claude-sonnet-5'),
    max_tokens: dist?.max_tokens ?? 1024,
    thinking: { type: 'disabled' },
    system, // cache_control tal cual viene del dist: abarata fixtures de la misma variante
    messages: buildMessages(fixture),
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'responder_lead', disable_parallel_tool_use: true },
  };
}

// ---------------------------------------------------------------------------
// Asserts
// ---------------------------------------------------------------------------

// Mapa slot → regex de "pregunta por ese slot". Si el slot está confirmado en
// estado.slots y alguna burbuja matchea su regex, el fixture falla
// (no_preguntar_slots_confirmados).
const SLOT_QUESTION_REGEX = {
  zona: /qu[eé] zona|d[oó]nde (?:te |le )?duele|en qu[eé] (?:parte|zona)/i,
  tiempo_evolucion: /desde (?:hace )?cu[aá]ndo|cu[aá]nto (?:tiempo )?llevas|hace cu[aá]nto (?:tiempo )?te/i,
  diagnostico: /qu[eé] (?:te|le) han (?:dicho|diagnosticado)|alg[uú]n diagn[oó]stico|(?:te|le) han hecho (?:alguna|alg[uú]n) (?:prueba|estudio)|qu[eé] diagn[oó]stico/i,
  impacto: /qu[eé] (?:has|ha) dejado de hacer|qu[eé] (?:te|le) (?:limita|cuesta|impide)|c[oó]mo (?:te|le) afecta|qu[eé] es lo que m[aá]s (?:te|le) (?:limita|cuesta)/i,
  camino_recorrido: /qu[eé] (?:has|ha) (?:probado|intentado)|qu[eé] (?:has|ha) ido probando|(?:has|ha)s? probado alg|qu[eé] est[aá]s haciendo (?:ahora|actualmente) para/i,
  miedo: /qu[eé] (?:es lo que )?m[aá]s (?:te|le) (?:preocupa|asusta|da miedo)|qu[eé] miedo|qu[eé] (?:te|le) da miedo/i,
  objetivo: /qu[eé] (?:te|le) gustar[ií]a (?:poder )?(?:hacer|recuperar|conseguir|volver)|qu[eé] (?:quieres|quiere) (?:conseguir|recuperar|lograr)|qu[eé] (?:te|le) gustar[ií]a que cambiara/i,
  pais: /qu[eé] pa[ií]s|desde d[oó]nde (?:me )?escribes|en qu[eé] pa[ií]s (?:vives|est[aá]s)/i,
  fecha_hito: /qu[eé] d[ií]a (?:es|tienes)|cu[aá]ndo (?:es|tienes) (?:la |el )?(?:cita|resonancia|prueba|consulta)/i,
};

/** JS no soporta el flag inline (?i): lo traducimos a flags nativos. */
function parseRegex(str) {
  let flags = '';
  let src = str;
  if (src.startsWith('(?i)')) {
    flags += 'i';
    src = src.slice(4);
  }
  return new RegExp(src, flags);
}

function countPreguntas(burbuja) {
  const abre = (burbuja.match(/¿/g) || []).length;
  const cierra = (burbuja.match(/\?/g) || []).length;
  return Math.max(abre, cierra); // "¿...?" cuenta 1
}

function runAsserts(fixture, input) {
  const fails = [];
  const a = fixture.asserts || {};
  const mensajes = Array.isArray(input.mensajes) ? input.mensajes : null;

  if (mensajes === null) {
    fails.push(`output inválido: "mensajes" no es array (${JSON.stringify(input.mensajes)})`);
    return fails;
  }
  const texto = mensajes.join('\n');

  if (a.stage_in && !a.stage_in.includes(input.pipeline_stage)) {
    fails.push(`stage_in: esperaba ${JSON.stringify(a.stage_in)}, salió "${input.pipeline_stage}"`);
  }
  if (a.handoff_in && !a.handoff_in.includes(input.handoff)) {
    fails.push(`handoff_in: esperaba ${JSON.stringify(a.handoff_in)}, salió "${input.handoff}"`);
  }
  if (a.mensajes_min !== undefined && mensajes.length < a.mensajes_min) {
    fails.push(`mensajes_min: esperaba >= ${a.mensajes_min}, salieron ${mensajes.length}`);
  }
  if (a.mensajes_max !== undefined && mensajes.length > a.mensajes_max) {
    fails.push(`mensajes_max: esperaba <= ${a.mensajes_max}, salieron ${mensajes.length}`);
  }
  if (a.max_chars_por_burbuja !== undefined) {
    mensajes.forEach((m, i) => {
      if (m.length > a.max_chars_por_burbuja) {
        fails.push(`max_chars_por_burbuja: burbuja ${i + 1} tiene ${m.length} chars (max ${a.max_chars_por_burbuja})`);
      }
    });
  }

  const debeList = a.debe_regex ? (Array.isArray(a.debe_regex) ? a.debe_regex : [a.debe_regex]) : [];
  for (const pat of debeList) {
    if (!parseRegex(pat).test(texto)) fails.push(`debe_regex no matchea: ${pat}`);
  }
  const noDebeList = a.no_debe_regex ? (Array.isArray(a.no_debe_regex) ? a.no_debe_regex : [a.no_debe_regex]) : [];
  for (const pat of noDebeList) {
    if (parseRegex(pat).test(texto)) fails.push(`no_debe_regex matchea (prohibido): ${pat}`);
  }

  const totalPreguntas = mensajes.reduce((acc, m) => acc + countPreguntas(m), 0);
  if (a.max_preguntas !== undefined && totalPreguntas > a.max_preguntas) {
    fails.push(`max_preguntas: ${totalPreguntas} preguntas (max ${a.max_preguntas})`);
  }
  if (a.min_preguntas !== undefined && totalPreguntas < a.min_preguntas) {
    fails.push(`min_preguntas: ${totalPreguntas} preguntas (min ${a.min_preguntas})`);
  }

  if (a.no_preguntar_slots_confirmados) {
    const slots = fixture.estado?.slots || {};
    for (const [slot, valor] of Object.entries(slots)) {
      if (valor === null || valor === undefined || String(valor).trim() === '') continue;
      const rx = SLOT_QUESTION_REGEX[slot];
      if (!rx) continue;
      mensajes.forEach((m, i) => {
        if (rx.test(m)) {
          fails.push(`no_preguntar_slots_confirmados: burbuja ${i + 1} re-pregunta "${slot}" (ya confirmado: "${valor}")`);
        }
      });
    }
  }

  const sn = input.slots_nuevos || {};
  for (const key of a.slots_nuevos_no_null || []) {
    if (sn[key] === null || sn[key] === undefined || String(sn[key]).trim() === '') {
      fails.push(`slots_nuevos_no_null: "${key}" salió ${JSON.stringify(sn[key])}`);
    }
  }
  for (const key of a.slots_nuevos_null || []) {
    if (sn[key] !== null && sn[key] !== undefined) {
      fails.push(`slots_nuevos_null: "${key}" debía ser null, salió ${JSON.stringify(sn[key])}`);
    }
  }
  for (const [key, pat] of Object.entries(a.slots_nuevos_regex || {})) {
    const val = sn[key];
    if (val === null || val === undefined || !parseRegex(pat).test(String(val))) {
      fails.push(`slots_nuevos_regex: "${key}"=${JSON.stringify(val)} no matchea ${pat}`);
    }
  }

  return fails;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callApi(request, apiKey) {
  let attempt = 0;
  for (;;) {
    attempt++;
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if ((res.status === 429 || res.status === 529) && attempt === 1) {
      console.log(`   [rate-limit ${res.status}] reintento en 10s...`);
      await sleep(10_000);
      continue;
    }
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(SESIONES_DIR)) die(`No existe ${SESIONES_DIR}`);

  let files = readdirSync(SESIONES_DIR).filter((f) => f.endsWith('.json')).sort();
  if (ONLY) files = files.filter((f) => f.includes(ONLY));
  if (!files.length) die(ONLY ? `Ningún fixture matchea --only ${ONLY}` : 'No hay fixtures en sesiones/');

  const fixtures = files.map((f) => {
    const fx = loadJson(join(SESIONES_DIR, f), `el fixture ${f}`);
    if (!VARIANTES.includes(fx.variante)) die(`Fixture ${f}: variante inválida "${fx.variante}"`);
    return fx;
  });
  // Agrupamos por variante para encadenar cache hits del mismo system prefix.
  fixtures.sort((x, y) => x.variante.localeCompare(y.variante) || x.id.localeCompare(y.id));

  // Chequeo de dists disponibles
  const variantesUsadas = [...new Set(fixtures.map((f) => f.variante))];
  const missing = variantesUsadas.filter((v) => !loadDist(v));
  if (missing.length) {
    const msg = `Falta(n) dist de: ${missing.join(', ')} → ejecuta primero build/build-tania-v4.mjs (genera prompts/tania/dist/tania-v4-<variante>.system.json)`;
    if (DRY) {
      console.log(`\n[WARN] ${msg}`);
      console.log('[WARN] --dry continúa con system placeholder para poder inspeccionar los requests.\n');
    } else {
      die(msg);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!DRY && !apiKey) die('Falta env ANTHROPIC_API_KEY (o usa --dry)');
  if (!DRY) mkdirSync(RESULTS_DIR, { recursive: true });

  console.log(`\nTania v4 — regresión: ${fixtures.length} fixture(s)${ONLY ? ` (--only ${ONLY})` : ''}${DRY ? ' [DRY RUN]' : ''}\n`);

  const results = [];
  for (const fixture of fixtures) {
    const dist = loadDist(fixture.variante);
    const request = buildRequest(fixture, dist);

    if (DRY) {
      const printable = {
        ...request,
        system: request.system.map((b) => ({
          ...b,
          text: b.text.length > 160 ? `${b.text.slice(0, 160)}… (${b.text.length} chars)` : b.text,
        })),
      };
      console.log(`── ${fixture.id} (${fixture.variante}) ${'─'.repeat(Math.max(1, 60 - fixture.id.length))}`);
      console.log(JSON.stringify(printable, null, 2));
      console.log('');
      results.push({ id: fixture.id, status: 'DRY', fails: [] });
      continue;
    }

    process.stdout.write(`→ ${fixture.id} (${fixture.variante})... `);
    let outcome;
    try {
      const { status, body } = await callApi(request, apiKey);
      writeFileSync(join(RESULTS_DIR, `${fixture.id}.json`), JSON.stringify({ request_meta: { model: request.model, variante: fixture.variante }, http_status: status, response: body }, null, 2), 'utf8');

      if (status !== 200) {
        outcome = { id: fixture.id, status: 'ERROR', fails: [`HTTP ${status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`], input: null };
      } else if (body.stop_reason !== 'tool_use') {
        outcome = { id: fixture.id, status: 'ERROR', fails: [`stop_reason="${body.stop_reason}" (esperaba tool_use)`], input: null };
      } else {
        const toolUse = (body.content || []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
        if (!toolUse) {
          outcome = { id: fixture.id, status: 'ERROR', fails: ['sin bloque tool_use "responder_lead" en la respuesta'], input: null };
        } else {
          const fails = runAsserts(fixture, toolUse.input);
          outcome = { id: fixture.id, status: fails.length ? 'FAIL' : 'PASS', fails, input: toolUse.input };
        }
      }
    } catch (err) {
      outcome = { id: fixture.id, status: 'ERROR', fails: [`excepción: ${err.message}`], input: null };
    }
    console.log(outcome.status);
    results.push(outcome);
    await sleep(DELAY_MS);
  }

  if (DRY) {
    console.log(`[DRY] ${results.length} request(s) impresos. Nada se envió a la API.`);
    return;
  }

  // ---------------- Tabla final ----------------
  const W = Math.max(...results.map((r) => r.id.length)) + 2;
  console.log(`\n${'='.repeat(78)}`);
  console.log(`${'FIXTURE'.padEnd(W)} RESULTADO`);
  console.log('-'.repeat(78));
  for (const r of results) {
    console.log(`${r.id.padEnd(W)} ${r.status}`);
    if (r.status !== 'PASS') {
      for (const f of r.fails) console.log(`${' '.repeat(W)} ✗ ${f}`);
      if (r.input) {
        console.log(`${' '.repeat(W)} output: stage=${r.input.pipeline_stage} handoff=${r.input.handoff}`);
        (r.input.mensajes || []).forEach((m, i) => console.log(`${' '.repeat(W)}   [${i + 1}] ${m}`));
        console.log(`${' '.repeat(W)}   slots_nuevos: ${JSON.stringify(Object.fromEntries(Object.entries(r.input.slots_nuevos || {}).filter(([, v]) => v !== null)))}`);
      }
    }
  }
  console.log('-'.repeat(78));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const error = results.filter((r) => r.status === 'ERROR').length;
  console.log(`TOTAL: ${results.length} | PASS: ${pass} | FAIL: ${fail} | ERROR: ${error}`);
  console.log(`Respuestas crudas en: ${RESULTS_DIR}`);
  if (fail + error > 0) process.exit(1);
}

main().catch((err) => die(err.stack || err.message));
