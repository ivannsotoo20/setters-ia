// ============================================================================
// build-workflows.mjs — genera los 3 workflows n8n de Tania v4 (importables).
//
//   node prompts/tania/guia-n8n/scripts/build-workflows.mjs
//
// Escribe:
//   prompts/tania/guia-n8n/workflows/tania-v4-principal.json
//   prompts/tania/guia-n8n/workflows/tania-v4-seguimiento.json
//   prompts/tania/guia-n8n/workflows/tania-v4-booking-webhook.json
//
// Fuentes de verdad que se inyectan en los nodos (n8n no lee ficheros):
//   prompts/tania/tools/responder_lead.schema.json  -> body del nodo HTTP Anthropic
//   prompts/tania/tools/etapas-foco.json            -> const ETAPAS_FOCO del nodo compose
//
// Si cambia cualquiera de esos dos ficheros: re-ejecutar este script y
// re-importar el workflow (o re-pegar a mano el trozo en el nodo).
// ============================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const OUT_DIR = path.join(REPO, 'prompts/tania/guia-n8n/workflows');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SCHEMA = JSON.parse(fs.readFileSync(path.join(REPO, 'prompts/tania/tools/responder_lead.schema.json'), 'utf8'));
const FOCO_RAW = JSON.parse(fs.readFileSync(path.join(REPO, 'prompts/tania/tools/etapas-foco.json'), 'utf8'));
const FOCO = Object.fromEntries(Object.entries(FOCO_RAW).filter(([k]) => !k.startsWith('_')));

const uuid = () => crypto.randomUUID();

// ---- credenciales (por nombre; ids de la instancia viva donde se conocen) ----
const CRED_REDIS = { redis: { id: '8hzeOW0EMAIMGC0c', name: 'Redis account' } };
const CRED_PG = { postgres: { id: 'oTeFsf1IcnDUkDPV', name: 'Postgres Supabase' } };
const CRED_MANYCHAT = { httpHeaderAuth: { id: 'Y1rcZdTN5fcamURD', name: 'Manychat Tania' } };
const CRED_ANTHROPIC = { httpHeaderAuth: { id: 'CREAR-EN-N8N-anthropic', name: 'Anthropic Tania' } };
const CRED_YCLOUD = { httpHeaderAuth: { id: 'CREAR-EN-N8N-ycloud', name: 'YCloud Tania' } };
const CRED_GHL = { httpHeaderAuth: { id: 'CREAR-EN-N8N-ghl', name: 'GHL Tania' } };

const WA_BUSINESS = '+34912649668'; // numero WhatsApp Business de Tania (confirmar: es el "to" de los inbound del workflow vivo)
const GHL_STAGE_FIELD_ID = 'dxMWq0IfosX5dK6VER8W'; // custom field "pipeline stage" en GHL (el mismo que usa el v3)

// ---------------------------------------------------------------- helpers
function node(name, type, typeVersion, position, parameters, extra = {}) {
  return { parameters, id: uuid(), name, type, typeVersion, position, ...extra };
}
function sticky(name, content, position, width = 380, height = 220) {
  return node(name, 'n8n-nodes-base.stickyNote', 1, position, { content, width, height });
}
function ifNode(name, position, cond, extra = {}) {
  return node(name, 'n8n-nodes-base.if', 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: uuid(), ...cond }],
      combinator: 'and',
    },
    options: {},
  }, extra);
}
const opBoolTrue = { type: 'boolean', operation: 'true', singleValue: true };
const opNotEmpty = { type: 'string', operation: 'notEmpty', singleValue: true };
const opStrEq = { type: 'string', operation: 'equals', name: 'filter.operator.equals' };
const opNumGt = { type: 'number', operation: 'gt' };

function pgQuery(name, position, query, paramsExpr, extra = {}) {
  const p = { operation: 'executeQuery', query, options: {} };
  if (paramsExpr) p.options.queryReplacement = paramsExpr;
  return node(name, 'n8n-nodes-base.postgres', 2.6, position, p, { credentials: CRED_PG, ...extra });
}
function codeNode(name, position, lines, extra = {}) {
  return node(name, 'n8n-nodes-base.code', 2, position, { jsCode: lines.join('\n') }, extra);
}
function switchNode(name, position, leftValueExpr, outputs) {
  return node(name, 'n8n-nodes-base.switch', 3.4, position, {
    rules: {
      values: outputs.map(([value, key]) => ({
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: uuid(), leftValue: leftValueExpr, rightValue: value, operator: opStrEq }],
          combinator: 'and',
        },
        renameOutput: true,
        outputKey: key,
      })),
    },
    options: {},
  });
}
function conn(map, from, to, outIdx = 0) {
  map[from] = map[from] || { main: [] };
  while (map[from].main.length <= outIdx) map[from].main.push([]);
  map[from].main[outIdx].push({ node: to, type: 'main', index: 0 });
}
function workflow(name, nodes, connections) {
  return { name, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Europe/Madrid' }, pinData: {} };
}

const FOCO_JSON = JSON.stringify(FOCO, null, 2);
const SCHEMA_JSON = JSON.stringify(SCHEMA, null, 2);

// Limpieza de turnos v3 compartida entre compose (principal) y compose (seguimiento)
const LIMPIEZA_LINES = [
  '// ---- limpieza de turnos v3 (historial n8n_chat_histories_tania) ----',
  'function limpiarHuman(content) {',
  "  const s = String(content == null ? '' : content);",
  "  const idx = s.indexOf('MENSAJE_USUARIO:');",
  "  if (idx >= 0) return s.slice(idx + 'MENSAJE_USUARIO:'.length).trim();",
  '  return s.trim();',
  '}',
  'function limpiarAi(content) {',
  "  const s = String(content == null ? '' : content).trim();",
  "  if (s.startsWith('{')) {",
  '    try {',
  '      const j = JSON.parse(s);',
  '      const out = j.output || j;',
  "      if (typeof out.mensaje_whatsapp === 'string') return out.mensaje_whatsapp.trim();",
  "      if (out.response && typeof out.response === 'object') {",
  '        return Object.keys(out.response).sort()',
  '          .map(function (k) { return out.response[k]; })',
  "          .filter(function (v) { return typeof v === 'string' && v.trim(); })",
  "          .join('\\n\\n').trim();",
  '      }',
  '    } catch (e) { /* no era JSON v3: se usa tal cual */ }',
  '  }',
  '  return s;',
  '}',
  'function turnosDesdeHistorial(rows) {',
  '  const turnos = [];',
  '  let prevHuman = null;',
  '  for (const row of rows) {',
  '    let msg = row.message;',
  "    if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch (e) { continue; } }",
  '    if (!msg || !msg.type) continue;',
  "    const bruto = msg.content == null ? '' : msg.content;",
  "    if (String(bruto).startsWith('Le hemos hecho al usuario')) continue; // nota interna v3: se salta",
  "    if (msg.type === 'human') {",
  '      const limpio = limpiarHuman(bruto);',
  '      if (!limpio) continue;',
  '      if (limpio === prevHuman) continue; // dedup de humans consecutivos identicos',
  '      prevHuman = limpio;',
  "      turnos.push({ role: 'user', text: limpio });",
  "    } else if (msg.type === 'ai') {",
  '      const limpio = limpiarAi(bruto);',
  '      if (!limpio) continue;',
  '      prevHuman = null;',
  "      turnos.push({ role: 'assistant', text: limpio });",
  '    }',
  '  }',
  '  // la API exige alternancia estricta user/assistant: se fusionan consecutivos del mismo rol',
  '  const merged = [];',
  '  for (const t of turnos) {',
  '    const last = merged[merged.length - 1];',
  "    if (last && last.role === t.role) last.text += '\\n\\n' + t.text;",
  '    else merged.push({ role: t.role, text: t.text });',
  '  }',
  '  // ... y que el primer mensaje sea user',
  "  if (merged.length && merged[0].role === 'assistant') {",
  "    merged.unshift({ role: 'user', text: '[Conversacion iniciada por Tania]' });",
  '  }',
  '  return merged;',
  '}',
  'function fechaMadrid() {',
  "  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));",
  "  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];",
  "  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');",
  '  return { iso: iso, dia: DIAS[d.getDay()] };',
  '}',
];

// util para clamp de texto en nodos parse
const CLAMP_LINES = [
  'function clamp300(m) {',
  '  m = String(m).trim();',
  '  if (m.length <= 300) return m;',
  "  const corte = m.lastIndexOf(' ', 297);",
  "  return m.slice(0, corte > 200 ? corte : 297) + '…';",
  '}',
];

// ============================================================ WORKFLOW A
function buildPrincipal() {
  const nodes = [];
  const cs = {};

  nodes.push(node('Webhook', 'n8n-nodes-base.webhook', 2.1, [0, 300],
    { httpMethod: 'POST', path: 'tania-v4', options: {} }, { webhookId: uuid() }));

  nodes.push(codeNode('normalizar', [220, 300], [
    '// Normaliza el payload entrante (YCloud WA / ManyChat IG) a un shape unico.',
    'function djb2(str) { let h = 5381; for (let i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; } return h.toString(36); }',
    'const body = $json.body || {};',
    "const out = { canal: '', message_id: '', dedup_key: '', session_id: '', texto: '', nombre: null, origen: 'inbound', flujo: null, es_opener: false, opener_texto: null, bot_off: false, wa_business: null, tipo_mensaje: 'text' };",
    'if (body.whatsappInboundMessage) {',
    '  const m = body.whatsappInboundMessage;',
    "  out.canal = 'whatsapp';",
    "  out.session_id = String(m.from || '');",
    "  out.wa_business = String(m.to || '');",
    '  out.nombre = (m.customerProfile && m.customerProfile.name) || null;',
    "  out.message_id = String(m.wamid || m.id || '');",
    "  out.tipo_mensaje = String(m.type || 'text');",
    "  if (out.tipo_mensaje === 'text') { out.texto = (m.text && m.text.body) || ''; }",
    "  else { out.texto = '[' + out.tipo_mensaje + ' recibido]'; } // audio/imagen: la transcripcion sigue en v3 (ver sticky)",
    '  out.flujo = null;',
    '} else if (body.user_id) {',
    "  out.canal = 'instagram';",
    '  out.session_id = String(body.user_id);',
    '  out.nombre = body.name || body.username || null;',
    "  out.texto = String(body.message || '');",
    '  if (body.bienvenida && !body.message) { out.es_opener = true; out.opener_texto = String(body.bienvenida); }',
    "  out.origen = body.lead === 'Outbound' ? 'outbound' : 'inbound'; // solo se usa para IG (bienvenidas vs inbound); WA infiere del historial en el propio prompt",
    "  // el flow de bienvenida de ManyChat DEBE incluir \"flujo\":\"bienvenida\" en el body (ver guia)",
    "  out.flujo = body.flujo || (body.bienvenida ? 'bienvenida' : null);",
    "  try { out.bot_off = body.conversation.messages[0].sender.custom_attributes.bot === 'off'; } catch (e) { out.bot_off = false; }",
    '  // ManyChat no manda id de mensaje: derivamos uno estable (usuario + hash del texto + minuto)',
    "  out.message_id = 'ig:' + out.session_id + ':' + djb2(out.texto || out.opener_texto || '') + ':' + Math.floor(Date.now() / 60000);",
    '}',
    "out.dedup_key = 'dedup:' + out.message_id;",
    'return [{ json: out }];',
  ]));

  nodes.push(ifNode('¿payload reconocido?', [440, 300],
    { leftValue: "={{ $json.canal || '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('fin: payload desconocido', 'n8n-nodes-base.noOp', 1, [660, 80], {}));

  nodes.push(ifNode('¿es opener?', [660, 300],
    { leftValue: '={{ $json.es_opener === true }}', rightValue: '', operator: opBoolTrue }));
  nodes.push(pgQuery('opener: upsert CRM', [880, 560], [
    '-- Alta minima del lead cuando ManyChat dispara la bienvenida (opener).',
    '-- El opener ES el primer contacto: aqui queda fijada fuente_v4 = ig-bienvenidas',
    '-- (asi el compose elegira la variante correcta cuando el lead responda).',
    'INSERT INTO public.clientes_crm_tania (id, nombre, stage_v4, slots, booking_status, fuente_v4)',
    "VALUES ($1, $2, 'conexion', '{}'::jsonb, 'none', 'ig-bienvenidas')",
    'ON CONFLICT (id) DO UPDATE SET',
    '  nombre = COALESCE(public.clientes_crm_tania.nombre, EXCLUDED.nombre),',
    '  fuente_v4 = COALESCE(public.clientes_crm_tania.fuente_v4, EXCLUDED.fuente_v4)',
    'RETURNING id, fuente_v4;',
  ].join('\n'), "={{ [ $('normalizar').first().json.session_id, $('normalizar').first().json.nombre ] }}"));
  nodes.push(pgQuery('opener: historial (ai)', [1100, 560], [
    '-- El opener queda registrado como turno ai: el compose lo vera como primer mensaje de Tania.',
    'INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "VALUES ($1, jsonb_build_object('type', 'ai', 'content', $2::text), now())",
    'RETURNING id;',
  ].join('\n'), "={{ [ $('normalizar').first().json.session_id, $('normalizar').first().json.opener_texto ] }}"));

  nodes.push(node('dedup Redis (INCR≈SETNX)', 'n8n-nodes-base.redis', 1, [880, 300],
    { operation: 'incr', key: '=dedup:{{ $json.message_id }}', expire: true, ttl: 3600 },
    { credentials: CRED_REDIS }));
  nodes.push(codeNode('evaluar dedup', [1100, 300], [
    '// El nodo Redis INCR devuelve el contador bajo un nombre de propiedad que depende de la key.',
    '// 1 = primera vez que vemos este message_id; >1 = duplicado (reintento del proveedor).',
    "const norm = $('normalizar').first().json;",
    'const raw = $input.first().json || {};',
    'let count = null;',
    'for (const v of Object.values(raw)) {',
    "  if (typeof v === 'number') { count = v; break; }",
    '  const n = Number(v);',
    "  if (!Number.isNaN(n) && v !== '' && v !== null) { count = n; break; }",
    '}',
    'return [{ json: Object.assign({}, norm, { dedup_count: count === null ? 1 : count }) }];',
  ]));
  nodes.push(ifNode('¿duplicado?', [1320, 300],
    { leftValue: '={{ $json.dedup_count }}', rightValue: 1, operator: opNumGt }));
  nodes.push(node('fin: duplicado', 'n8n-nodes-base.noOp', 1, [1540, 80], {}));

  nodes.push(pgQuery('dedup persistente (Postgres)', [1540, 300], [
    '-- Segunda capa de dedup: sobrevive a un flush de Redis. Atomica (SETNX en SQL).',
    'INSERT INTO public.tania_mensajes_procesados (message_id, session_id, canal)',
    'VALUES ($1, $2, $3)',
    'ON CONFLICT (message_id) DO NOTHING',
    'RETURNING message_id;',
  ].join('\n'), "={{ [ $('normalizar').first().json.message_id, $('normalizar').first().json.session_id, $('normalizar').first().json.canal ] }}",
    { alwaysOutputData: true }));
  nodes.push(ifNode('¿mensaje nuevo?', [1760, 300],
    { leftValue: "={{ ($json.message_id || '') + '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('fin: ya procesado', 'n8n-nodes-base.noOp', 1, [1980, 80], {}));

  nodes.push(node('buffer: RPUSH', 'n8n-nodes-base.redis', 1, [1980, 300],
    { operation: 'push', list: "=buffer:{{ $('normalizar').first().json.session_id }}", messageData: "={{ $('normalizar').first().json.texto }}", tail: true },
    { credentials: CRED_REDIS }));
  nodes.push(node('buffer: SET last', 'n8n-nodes-base.redis', 1, [2200, 300],
    { operation: 'set', key: "=last:{{ $('normalizar').first().json.session_id }}", value: "={{ $('normalizar').first().json.message_id }}", expire: true, ttl: 600 },
    { credentials: CRED_REDIS }));
  nodes.push(node('esperar ráfaga (30s)', 'n8n-nodes-base.wait', 1.1, [2420, 300], { amount: 30 }, { webhookId: uuid() }));
  nodes.push(node('leer last', 'n8n-nodes-base.redis', 1, [2640, 300],
    { operation: 'get', propertyName: 'last_message_id', key: "=last:{{ $('normalizar').first().json.session_id }}", options: {} },
    { credentials: CRED_REDIS }));
  nodes.push(ifNode('¿soy el último?', [2860, 300],
    { leftValue: "={{ ($json.last_message_id || '') + '' }}", rightValue: "={{ $('normalizar').first().json.message_id }}", operator: opStrEq }));
  nodes.push(node('fin: llegó otro mensaje', 'n8n-nodes-base.noOp', 1, [3080, 80], {}));
  nodes.push(node('leer ráfaga', 'n8n-nodes-base.redis', 1, [3080, 300],
    { operation: 'get', propertyName: 'rafaga', key: "=buffer:{{ $('normalizar').first().json.session_id }}", options: {} },
    { credentials: CRED_REDIS }));
  nodes.push(node('borrar buffer', 'n8n-nodes-base.redis', 1, [3300, 300],
    { operation: 'delete', key: "=buffer:{{ $('normalizar').first().json.session_id }}" },
    { credentials: CRED_REDIS }));

  const LOCK_SQL = [
    '-- Lock por sesion. La CTE limpia locks muertos (>120s); el INSERT solo devuelve fila si adquirimos.',
    '-- Nota: si el lock stale era de ESTA misma sesion, este intento puede devolver vacio (el DELETE',
    '-- de la CTE no es visible dentro del mismo statement) y se adquiere en el reintento de 10s. Asumido.',
    'WITH limpieza AS (',
    '  DELETE FROM public.tania_session_locks',
    "  WHERE locked_at < now() - interval '120 seconds'",
    ')',
    'INSERT INTO public.tania_session_locks (session_id)',
    'VALUES ($1)',
    'ON CONFLICT (session_id) DO NOTHING',
    'RETURNING session_id;',
  ].join('\n');
  const lockParams = "={{ [ $('normalizar').first().json.session_id ] }}";
  nodes.push(pgQuery('lock: intento 1', [3520, 300], LOCK_SQL, lockParams, { alwaysOutputData: true }));
  nodes.push(ifNode('¿lock ok? (1)', [3740, 300], { leftValue: "={{ ($json.session_id || '') + '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('esperar lock (10s)', 'n8n-nodes-base.wait', 1.1, [3740, 560], { amount: 10 }, { webhookId: uuid() }));
  nodes.push(pgQuery('lock: intento 2', [3960, 560], LOCK_SQL, lockParams, { alwaysOutputData: true }));
  nodes.push(ifNode('¿lock ok? (2)', [4180, 560], { leftValue: "={{ ($json.session_id || '') + '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('esperar lock 2 (10s)', 'n8n-nodes-base.wait', 1.1, [4180, 800], { amount: 10 }, { webhookId: uuid() }));
  nodes.push(pgQuery('lock: intento 3', [4400, 800], LOCK_SQL, lockParams, { alwaysOutputData: true }));
  nodes.push(ifNode('¿lock ok? (3)', [4620, 800], { leftValue: "={{ ($json.session_id || '') + '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('fin: sesión bloqueada', 'n8n-nodes-base.noOp', 1, [4840, 800], {}));

  nodes.push(ifNode('boton_on/off (¿bot apagado?)', [4840, 300],
    { leftValue: "={{ $('normalizar').first().json.bot_off === true }}", rightValue: '', operator: opBoolTrue }));
  nodes.push(pgQuery('bot off: guardar human', [5060, 80], [
    '-- Con el bot apagado seguimos registrando lo que dice el lead (el historial no pierde turnos).',
    'INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "VALUES ($1, jsonb_build_object('type', 'human', 'content', $2::text), now())",
    'RETURNING id;',
  ].join('\n'), "={{ [ $('normalizar').first().json.session_id, ($('leer ráfaga').first().json.rafaga || [ $('normalizar').first().json.texto ]).join('\\n') ] }}"));
  nodes.push(pgQuery('bot off: liberar lock', [5280, 80],
    'DELETE FROM public.tania_session_locks WHERE session_id = $1 RETURNING session_id;',
    lockParams, { alwaysOutputData: true }));

  nodes.push(pgQuery('cargar crm', [5060, 300], [
    'SELECT id, nombre, contact_id, slots, stage_v4, pipeline_stage, fuente_v4,',
    '       link_enviado_fecha, booking_status, followups_enviados',
    'FROM public.clientes_crm_tania',
    'WHERE id = $1',
    'LIMIT 1;',
  ].join('\n'), lockParams, { alwaysOutputData: true }));
  nodes.push(pgQuery('cargar historial', [5280, 300], [
    '-- Historial completo de la sesion, en orden. El compose limpia los turnos v3 al leer.',
    'SELECT id, message, fecha_mensaje',
    'FROM public.n8n_chat_histories_tania',
    'WHERE session_id = $1',
    'ORDER BY id ASC;',
  ].join('\n'), lockParams, { alwaysOutputData: true }));

  const composeLines = [
    '// ============================================================================',
    '// COMPOSE v4 - construye system + messages para POST /v1/messages (Anthropic).',
    '// n8n NO lee ficheros del repo: ETAPAS_FOCO y DIST van COPIADOS aqui.',
    '//  - ETAPAS_FOCO: copia de prompts/tania/tools/etapas-foco.json.',
    '//    Si ese fichero cambia -> RE-PEGAR aqui el objeto entero.',
    '//  - DIST: pegar el objeto COMPLETO de cada variante desde prompts/tania/dist/',
    '//    (shape: {"variante","model","max_tokens","thinking","system":[2 bloques con',
    '//    cache_control ephemeral ttl 1h]}). Mientras esten a null, este nodo lanza error.',
    '// ============================================================================',
    'const ETAPAS_FOCO = ' + FOCO_JSON + ';',
    '',
    'const DIST = {',
    "  'ig-inbound': null,      // << PEGAR AQUI prompts/tania/dist/tania-v4-ig-inbound.system.json",
    "  'ig-bienvenidas': null,  // << PEGAR AQUI prompts/tania/dist/tania-v4-ig-bienvenidas.system.json",
    "  'whatsapp': null,        // << PEGAR AQUI prompts/tania/dist/tania-v4-whatsapp.system.json",
    '};',
    '',
    ...LIMPIEZA_LINES,
    '',
    "const norm = $('normalizar').first().json;",
    "const crmRow = $('cargar crm').first().json || {};",
    'const crm = crmRow.id ? crmRow : {};',
    'const histRows = $input.all().map(function (i) { return i.json; }).filter(function (r) { return r && r.message; });',
    '',
    'let rafaga = [];',
    "try { rafaga = $('leer ráfaga').first().json.rafaga || []; } catch (e) { rafaga = []; }",
    'if (!Array.isArray(rafaga)) rafaga = [String(rafaga)];',
    'rafaga = rafaga.map(function (t) { return String(t).trim(); }).filter(Boolean);',
    'if (rafaga.length === 0 && norm.texto) rafaga = [String(norm.texto).trim()];',
    "const textoRafaga = rafaga.join('\\n');",
    '',
    '// ---- seleccion de variante de dist ----',
    '// WhatsApp es un unico prompt para ambos sentidos (el propio prompt infiere',
    '// outbound/inbound mirando quien escribio primero en el historial). IG SI se',
    '// separa por flujo (bienvenidas vs inbound), asi que ahi el origen importa.',
    '// La fuente queda FIJADA en clientes_crm_tania.fuente_v4 al primer contacto;',
    '// si aun no existe, se decide por canal/flujo de este payload.',
    'let variante = (crmRow && crmRow.fuente_v4) || null;',
    'if (!variante) {',
    "  if (norm.canal === 'whatsapp') variante = 'whatsapp';",
    "  else variante = (norm.flujo === 'bienvenida') ? 'ig-bienvenidas' : 'ig-inbound';",
    '}',
    'const dist = DIST[variante];',
    'if (!dist || !Array.isArray(dist.system)) {',
    "  throw new Error('DIST no configurado para la variante \"' + variante + '\". Pega el contenido de prompts/tania/dist/tania-v4-' + variante + '.system.json en el nodo compose.');",
    '}',
    '',
    'const merged = turnosDesdeHistorial(histRows);',
    '// si el historial termina en turno user (p.ej. bot apagado un rato), se pliega en el turno actual',
    "let prefijoPendiente = '';",
    "if (merged.length && merged[merged.length - 1].role === 'user') { prefijoPendiente = merged.pop().text; }",
    "const textoTurno = [prefijoPendiente, textoRafaga].filter(Boolean).join('\\n');",
    '',
    '// ---- bloque <estado_conversacion> (contrato cerrado) ----',
    "const stage = crm.stage_v4 || 'conexion';",
    'const foco = ETAPAS_FOCO[stage] || ETAPAS_FOCO.conexion;',
    "const slots = (crm.slots && typeof crm.slots === 'object') ? crm.slots : {};",
    'const slotsLineas = Object.entries(slots)',
    "  .filter(function (e) { return e[1] !== null && e[1] !== undefined && String(e[1]).trim() !== ''; })",
    "  .map(function (e) { return '- ' + e[0] + ': ' + e[1]; });",
    'const f = fechaMadrid();',
    "const linkLinea = crm.link_enviado_fecha ? ('enviado el ' + String(crm.link_enviado_fecha).slice(0, 10)) : 'no enviado';",
    "const RESERVA = { none: 'sin reserva', booked: 'reservada', no_show: 'no acudió', cancelled: 'cancelada' };",
    'const estado = [',
    "  '<estado_conversacion>',",
    "  'FECHA: ' + f.iso + ' (' + f.dia + ')',",
    "  'ETAPA: ' + stage,",
    "  'FOCO: ' + foco,",
    "  'DATOS CONFIRMADOS (PROHIBIDO re-preguntar):',",
    "].concat(slotsLineas.length ? slotsLineas : ['- (aún ninguno)']).concat([",
    "  'LINK DE AGENDA: ' + linkLinea,",
    "  'RESERVA: ' + (RESERVA[crm.booking_status || 'none'] || 'sin reserva'),",
    "  '</estado_conversacion>',",
    "]).join('\\n');",
    '',
    '// ---- messages: historial limpio + turno actual (estado + rafaga) ----',
    'const messages = merged.map(function (t) { return { role: t.role, content: t.text }; });',
    'messages.push({',
    "  role: 'user',",
    '  content: [',
    "    { type: 'text', text: estado },",
    "    { type: 'text', text: textoTurno || '(el lead no envió texto)' },",
    '  ],',
    '});',
    '// breakpoint 3 de cache (movil): ultimo bloque del PENULTIMO turno, ttl 1h.',
    '// Los breakpoints 1 y 2 vienen dentro de dist.system. Total 3 <= 4 permitidos.',
    'if (messages.length >= 2) {',
    '  const pen = messages[messages.length - 2];',
    "  const blocks = typeof pen.content === 'string' ? [{ type: 'text', text: pen.content }] : pen.content;",
    "  blocks[blocks.length - 1].cache_control = { type: 'ephemeral', ttl: '1h' };",
    '  pen.content = blocks;',
    '}',
    '',
    'return [{ json: {',
    '  model: dist.model,',
    '  max_tokens: dist.max_tokens || 1024,',
    '  system_blocks: dist.system,',
    '  messages: messages,',
    '  session_id: norm.session_id,',
    '  canal: norm.canal,',
    '  variante: variante,',
    '  texto_rafaga: textoTurno,',
    '  stage_actual: stage,',
    '  slots_previos: slots,',
    '  link_enviado_fecha: crm.link_enviado_fecha || null,',
    "  booking_status: crm.booking_status || 'none',",
    '  contact_id: crm.contact_id || null,',
    '  nombre: norm.nombre || crm.nombre || null,',
    '} }];',
  ];
  nodes.push(codeNode('compose', [5500, 300], composeLines));

  const anthropicBody = [
    '={',
    '  "model": {{ JSON.stringify($json.model) }},',
    '  "max_tokens": {{ $json.max_tokens }},',
    '  "thinking": { "type": "disabled" },',
    '  "system": {{ JSON.stringify($json.system_blocks) }},',
    '  "tools": [',
    SCHEMA_JSON.split('\n').map((l) => '    ' + l).join('\n'),
    '  ],',
    '  "tool_choice": { "type": "tool", "name": "responder_lead", "disable_parallel_tool_use": true },',
    '  "messages": {{ JSON.stringify($json.messages) }}',
    '}',
  ].join('\n');
  nodes.push(node('llamar Anthropic (Sonnet)', 'n8n-nodes-base.httpRequest', 4.3, [5720, 300], {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: anthropicBody,
    options: { timeout: 60000 },
  }, { credentials: CRED_ANTHROPIC, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }));

  const parseLines = [
    '// ============================================================================',
    '// PARSE - extrae el tool_use responder_lead, valida enums, clampa burbujas,',
    '// calcula proximo_recontacto y el mapper stage_v4 -> pipeline_stage viejo (GHL).',
    '// ============================================================================',
    'const res = $input.first().json;',
    "const comp = $('compose').first().json;",
    '',
    "const STAGES = ['conexion', 'descubrimiento', 'cualificacion', 'puente', 'llamada_ofrecida', 'link_enviado', 'agendado', 'realizada', 'derivado_medico', 'en_espera_hito', 'dormido', 'perdido', 'cliente_activo', 'handoff_humano'];",
    "const HANDOFFS = ['none', 'agenda', 'descualificado', 'silencioso', 'humano'];",
    '// mapper transitorio (2 semanas tras el corte) al custom field viejo de GHL:',
    'const GHL_STAGE_MAP = {',
    "  conexion: 'descubrimiento', descubrimiento: 'descubrimiento',",
    "  cualificacion: 'cualificacion', puente: 'cualificacion',",
    "  llamada_ofrecida: 'llamada_ofrecida', link_enviado: 'link_enviado',",
    "  agendado: 'agendado', realizada: 'agendado',",
    "  derivado_medico: 'descubrimiento', en_espera_hito: 'descubrimiento', dormido: 'descubrimiento',",
    "  perdido: 'perdido', cliente_activo: 'agendado', handoff_humano: 'agendado',",
    '};',
    "const SLOT_KEYS = ['zona', 'tiempo_evolucion', 'diagnostico', 'impacto', 'camino_recorrido', 'miedo', 'objetivo', 'pais', 'fecha_hito', 'hito_descripcion'];",
    '',
    ...CLAMP_LINES,
    'function fechaHoyMadrid() {',
    "  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));",
    "  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');",
    '}',
    '',
    'let error = null;',
    "const block = (res.content || []).find(function (b) { return b.type === 'tool_use' && b.name === 'responder_lead'; });",
    'const input = block && block.input ? block.input : null;',
    "if (!input) error = 'sin_tool_use';",
    '',
    'let mensajes = [];',
    'let stage = comp.stage_actual;',
    "let handoff = 'none';",
    'const slotsNuevos = {};',
    'if (input) {',
    "  mensajes = Array.isArray(input.mensajes) ? input.mensajes.filter(function (m) { return typeof m === 'string' && m.trim(); }) : [];",
    '  // clamp de seguridad: max 3 burbujas, max 300 chars por burbuja',
    '  mensajes = mensajes.slice(0, 3).map(clamp300);',
    "  if (STAGES.indexOf(input.pipeline_stage) >= 0) stage = input.pipeline_stage; else error = error || 'stage_invalido';",
    "  if (HANDOFFS.indexOf(input.handoff) >= 0) handoff = input.handoff; else error = error || 'handoff_invalido';",
    '  const sn = input.slots_nuevos || {};',
    '  for (const k of SLOT_KEYS) {',
    '    const v = sn[k];',
    "    if (v !== null && v !== undefined && String(v).trim() !== '') slotsNuevos[k] = String(v).trim();",
    '  }',
    '}',
    "if (handoff === 'silencioso') mensajes = [];",
    '',
    'const slotsMerged = Object.assign({}, comp.slots_previos, slotsNuevos);',
    "const aiText = mensajes.join('\\n\\n');",
    "const linkEnviadoAhora = mensajes.some(function (m) { return m.indexOf('leadconnectorhq') >= 0; });",
    'const linkFechaNueva = linkEnviadoAhora ? fechaHoyMadrid() : null;',
    'const linkAlguna = linkEnviadoAhora || !!comp.link_enviado_fecha;',
    '',
    '// ---- regla de proximo_recontacto ----',
    'const H = 3600 * 1000;',
    'let proximo = null;',
    'let motivo = null;',
    "if (['agendado', 'realizada', 'perdido', 'handoff_humano', 'cliente_activo', 'dormido'].indexOf(stage) >= 0",
    "    || ['agenda', 'humano', 'descualificado'].indexOf(handoff) >= 0) {",
    '  proximo = null; motivo = null;',
    "} else if (stage === 'en_espera_hito' && slotsMerged.fecha_hito) {",
    "  const fh = new Date(String(slotsMerged.fecha_hito) + 'T09:00:00');",
    '  proximo = isNaN(fh.getTime()) ? new Date(Date.now() + 48 * H) : new Date(fh.getTime() + 24 * H);',
    "  motivo = 'hito';",
    "} else if (stage === 'derivado_medico') {",
    "  proximo = new Date(Date.now() + 8 * 24 * H); motivo = 'derivado_medico';",
    "} else if (stage === 'link_enviado' || linkAlguna) {",
    "  proximo = new Date(Date.now() + 24 * H); motivo = 'post_link';",
    '} else {',
    "  proximo = new Date(Date.now() + 48 * H); motivo = 'post_conv'; // conversacion activa sin cierre",
    '}',
    '',
    'const usage = res.usage || {};',
    'return [{ json: {',
    '  mensajes: mensajes,',
    '  ai_text: aiText,',
    '  stage_v4: stage,',
    '  handoff: handoff,',
    '  slots_nuevos: slotsNuevos,',
    '  slots_nuevos_json: JSON.stringify(slotsNuevos),',
    "  ghl_stage: GHL_STAGE_MAP[stage] || 'descubrimiento',",
    '  link_enviado_fecha_nueva: linkFechaNueva,',
    '  proximo_recontacto: proximo ? proximo.toISOString() : null,',
    '  recontacto_motivo: motivo,',
    '  session_id: comp.session_id,',
    '  canal: comp.canal,',
    '  model: comp.model,',
    '  input_tokens: usage.input_tokens != null ? usage.input_tokens : null,',
    '  output_tokens: usage.output_tokens != null ? usage.output_tokens : null,',
    '  cache_creation_input_tokens: usage.cache_creation_input_tokens != null ? usage.cache_creation_input_tokens : null,',
    '  cache_read_input_tokens: usage.cache_read_input_tokens != null ? usage.cache_read_input_tokens : null,',
    '  stop_reason: res.stop_reason || null,',
    '  num_burbujas: mensajes.length,',
    '  error: error,',
    '} }];',
  ];
  nodes.push(codeNode('parse', [5940, 300], parseLines));

  nodes.push(pgQuery('log LLM (tania_llm_calls)', [6160, 300], [
    'INSERT INTO public.tania_llm_calls',
    '  (session_id, canal, workflow, model, input_tokens, output_tokens,',
    '   cache_creation_input_tokens, cache_read_input_tokens, stop_reason,',
    '   stage_v4, handoff, num_burbujas, error)',
    "VALUES ($1, $2, 'principal', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    'RETURNING id;',
  ].join('\n'), "={{ [ $json.session_id, $json.canal, $json.model, $json.input_tokens, $json.output_tokens, $json.cache_creation_input_tokens, $json.cache_read_input_tokens, $json.stop_reason, $json.stage_v4, $json.handoff, $json.num_burbujas, $json.error ] }}"));

  nodes.push(ifNode('¿hay burbujas?', [6380, 300],
    { leftValue: "={{ $('parse').first().json.mensajes.length > 0 }}", rightValue: '', operator: opBoolTrue }));

  nodes.push(codeNode('preparar burbujas', [6600, 140], [
    "const p = $('parse').first().json;",
    'return p.mensajes.map(function (texto, i) {',
    '  return { json: { texto: texto, indice: i + 1, total: p.mensajes.length } };',
    '});',
  ]));
  nodes.push(node('burbujas (1 a 1)', 'n8n-nodes-base.splitInBatches', 3, [6820, 140], { batchSize: 1, options: {} }));

  nodes.push(switchNode('¿canal?', [7040, 140], "={{ $('normalizar').first().json.canal }}",
    [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram']]));

  nodes.push(node('enviar_texto (YCloud WA)', 'n8n-nodes-base.httpRequest', 4.3, [7260, 40], {
    method: 'POST',
    url: 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "from": "{{ $(\'normalizar\').first().json.wa_business }}",',
      '  "to": "{{ $(\'normalizar\').first().json.session_id }}",',
      '  "type": "text",',
      '  "text": { "body": {{ JSON.stringify($json.texto) }}, "preview_url": true }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_YCLOUD }));

  nodes.push(node('enviar_texto (ManyChat IG)', 'n8n-nodes-base.httpRequest', 4.3, [7260, 240], {
    method: 'POST',
    url: 'https://api.manychat.com/fb/sending/sendContent',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "subscriber_id": "{{ $(\'normalizar\').first().json.session_id }}",',
      '  "data": {',
      '    "version": "v2",',
      '    "content": {',
      '      "type": "instagram",',
      '      "messages": [ { "type": "text", "text": {{ JSON.stringify($json.texto) }} } ]',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_MANYCHAT }));

  nodes.push(node('pausa humana (2-4s)', 'n8n-nodes-base.wait', 1.1, [7480, 140],
    { amount: '={{ 2 + Math.floor(Math.random() * 3) }}' }, { webhookId: uuid() }));

  nodes.push(pgQuery('guardar historial', [7700, 300], [
    '-- Turno human (texto limpio de la rafaga) + turno ai (burbujas unidas con \\n\\n) si lo hay.',
    '-- La CTE garantiza que el id serial del human es menor que el del ai.',
    'WITH turno_human AS (',
    '  INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "  VALUES ($1, jsonb_build_object('type', 'human', 'content', $2::text), now())",
    '  RETURNING id',
    ')',
    'INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "SELECT $1, jsonb_build_object('type', 'ai', 'content', $3::text), now()",
    'FROM turno_human',
    "WHERE length(coalesce($3, '')) > 0",
    'RETURNING id;',
  ].join('\n'), "={{ [ $('compose').first().json.session_id, $('compose').first().json.texto_rafaga, $('parse').first().json.ai_text ] }}",
    { alwaysOutputData: true, executeOnce: true }));

  nodes.push(pgQuery('actualizar CRM', [7920, 300], [
    '-- Upsert del lead: merge de slots (nunca pisar con null), stage v4 + espejo del stage viejo,',
    '-- fecha del primer link, y proximo_recontacto segun la regla del parse.',
    '-- fuente_v4 se fija al PRIMER contacto (COALESCE) y ya no cambia a mitad de conversacion.',
    '-- followups_enviados se resetea: el lead acaba de responder.',
    'INSERT INTO public.clientes_crm_tania',
    '  (id, nombre, slots, stage_v4, pipeline_stage, link_enviado_fecha,',
    '   proximo_recontacto, recontacto_motivo, booking_status, fuente_v4)',
    'VALUES',
    "  ($1, $2, $3::jsonb, $4, $5, $6::date, $7::timestamptz, $8, 'none', $9)",
    'ON CONFLICT (id) DO UPDATE SET',
    '  nombre = COALESCE(clientes_crm_tania.nombre, EXCLUDED.nombre),',
    '  slots = clientes_crm_tania.slots || EXCLUDED.slots,',
    '  stage_v4 = EXCLUDED.stage_v4,',
    '  pipeline_stage = EXCLUDED.pipeline_stage,',
    '  link_enviado_fecha = COALESCE(EXCLUDED.link_enviado_fecha, clientes_crm_tania.link_enviado_fecha),',
    '  proximo_recontacto = EXCLUDED.proximo_recontacto,',
    '  recontacto_motivo = EXCLUDED.recontacto_motivo,',
    '  booking_status = clientes_crm_tania.booking_status,',
    '  fuente_v4 = COALESCE(clientes_crm_tania.fuente_v4, EXCLUDED.fuente_v4),',
    '  followups_enviados = 0',
    'RETURNING id, stage_v4, fuente_v4, proximo_recontacto;',
  ].join('\n'), "={{ [ $('compose').first().json.session_id, $('compose').first().json.nombre, $('parse').first().json.slots_nuevos_json, $('parse').first().json.stage_v4, $('parse').first().json.ghl_stage, $('parse').first().json.link_enviado_fecha_nueva, $('parse').first().json.proximo_recontacto, $('parse').first().json.recontacto_motivo, $('compose').first().json.variante ] }}",
    { executeOnce: true }));

  nodes.push(ifNode('¿tiene contact_id GHL?', [8140, 300],
    { leftValue: "={{ ($('cargar crm').first().json.contact_id || '') + '' }}", rightValue: '', operator: opNotEmpty },
    { executeOnce: true }));

  nodes.push(node('espejo GHL (stage)', 'n8n-nodes-base.httpRequest', 4.3, [8360, 140], {
    method: 'PUT',
    url: "=https://services.leadconnectorhq.com/contacts/{{ $('cargar crm').first().json.contact_id }}",
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Version', value: '2021-07-28' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "customFields": [',
      '    { "id": "' + GHL_STAGE_FIELD_ID + '", "value": "{{ $(\'parse\').first().json.ghl_stage }}" }',
      '  ]',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_GHL, onError: 'continueRegularOutput' }));

  nodes.push(pgQuery('liberar lock', [8580, 300],
    'DELETE FROM public.tania_session_locks WHERE session_id = $1 RETURNING session_id;',
    lockParams, { alwaysOutputData: true, executeOnce: true }));

  nodes.push(ifNode('¿handoff humano?', [8800, 300],
    { leftValue: "={{ $('parse').first().json.handoff }}", rightValue: 'humano', operator: opStrEq }));

  nodes.push(node('notificar a Tania (CONFIGURAR)', 'n8n-nodes-base.httpRequest', 4.3, [9020, 140], {
    method: 'POST',
    url: 'https://CONFIGURAR-destino-de-notificacion.example.com/webhook',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "evento": "handoff_humano",',
      '  "lead": "{{ $(\'compose\').first().json.session_id }}",',
      '  "nombre": {{ JSON.stringify($(\'compose\').first().json.nombre) }},',
      '  "canal": "{{ $(\'compose\').first().json.canal }}",',
      '  "etapa": "{{ $(\'parse\').first().json.stage_v4 }}",',
      '  "ultimo_mensaje_lead": {{ JSON.stringify($(\'compose\').first().json.texto_rafaga) }}',
      '}',
    ].join('\n'),
    options: {},
  }, { disabled: true }));
  nodes.push(node('fin', 'n8n-nodes-base.noOp', 1, [9020, 460], {}));

  // ---- sticky notes ----
  nodes.push(sticky('Sticky — resumen', [
    '## Tania v4 — principal (IG + WA)',
    'Sustituye a `agente_cerebro1` + `Postgres Chat Memory1` + `Structured/Auto-fixing Output Parser` + `OpenAI Chat Model` de los workflows v3. Cero nodos LangChain: la llamada al modelo es HTTP puro contra la API Anthropic.',
    '',
    'Un solo webhook `POST /webhook/tania-v4` recibe ManyChat (IG) y YCloud (WA); `normalizar` detecta el canal por el shape del payload.',
    '',
    '**Flujo**: dedup → buffer de ráfaga (Redis) → lock de sesión (Postgres) → botón on/off → compose (limpieza v3 + caché) → Anthropic (tool `responder_lead` forzado) → parse → burbujas 1 a 1 → historial + CRM + espejo GHL → liberar lock → handoff.',
  ].join('\n'), [0, -280], 480, 320));

  nodes.push(sticky('Sticky — qué pegar dónde', [
    '## Qué pegar dónde (n8n no lee ficheros)',
    '1. **Nodo `compose`** → `DIST`: pegar el objeto completo de los 3 prompts de `prompts/tania/dist/`:',
    '   - `ig-inbound` ← `tania-v4-ig-inbound.system.json`',
    '   - `ig-bienvenidas` ← `tania-v4-ig-bienvenidas.system.json`',
    '   - `whatsapp` ← `tania-v4-whatsapp.system.json` (unico prompt para ambos sentidos de WA)',
    '   Hasta entonces el nodo lanza error a propósito. La variante se fija en `clientes_crm_tania.fuente_v4` al primer contacto; si es NULL se decide por canal/flujo (el flow de bienvenida de ManyChat debe mandar `"flujo":"bienvenida"` en el body; WA siempre usa `whatsapp`).',
    '2. **Nodo `compose`** → `ETAPAS_FOCO`: ya viene copiado de `prompts/tania/tools/etapas-foco.json`. Si ese fichero cambia en el repo → **re-pegar aquí** (o regenerar con `scripts/build-workflows.mjs`).',
    '3. **Nodo `llamar Anthropic`** → el tool schema `responder_lead` ya va inline en el body. Si cambia `prompts/tania/tools/responder_lead.schema.json` → ídem.',
    '4. **Credencial `Anthropic Tania`**: Header Auth, nombre `x-api-key`, valor `sk-ant-...`.',
  ].join('\n'), [5440, -300], 520, 360));

  nodes.push(sticky('Sticky — dedup', [
    '## Dedup (2 capas)',
    '- **Redis INCR con TTL 3600** = equivalente atómico a `SETNX dedup:{message_id} EX 3600` (el nodo Redis de n8n no expone NX; INCR devuelve 1 solo la primera vez). `dedup_count > 1` ⇒ reintento del proveedor ⇒ descartar.',
    '- **Postgres `tania_mensajes_procesados`** = capa persistente (sobrevive a un flush de Redis).',
    '- WA: `message_id` = `wamid` de YCloud. IG: ManyChat no manda id ⇒ se deriva `user_id + hash(texto) + minuto`.',
  ].join('\n'), [880, -180], 440, 240));

  nodes.push(sticky('Sticky — buffer de ráfaga', [
    '## Buffer de ráfaga (30s)',
    'Cada mensaje hace RPUSH a `buffer:{session}` y marca `last:{session}`.',
    'Tras 30s, solo la ejecución cuyo `message_id` sigue siendo el último procesa TODO el buffer; el resto muere en `fin: llegó otro mensaje`.',
    'Equivale al patrón Redis7/Wait6/Redis6/If6/Redis9 del v3, comparando por id en vez de por texto.',
  ].join('\n'), [1980, -180], 440, 210));

  nodes.push(sticky('Sticky — lock de sesión', [
    '## Lock por sesión (Postgres)',
    'Evita que dos ráfagas de la misma sesión compongan/envíen a la vez.',
    '- Adquirir: `INSERT ... ON CONFLICT DO NOTHING RETURNING` (+ limpieza de locks >120s en la misma query).',
    '- 3 intentos con 10s de espera; si no ⇒ `fin: sesión bloqueada` (la otra ejecución ya está respondiendo).',
    '- Se libera SIEMPRE al final (también en la rama de bot apagado).',
  ].join('\n'), [3520, -180], 440, 220));

  nodes.push(sticky('Sticky — botón on/off', [
    '## Botón on/off',
    'IG: custom attribute `bot=off` de ManyChat (mismo criterio que el `boton_on/off` del v3).',
    'WA: YCloud no manda atributos ⇒ para "apagar" WhatsApp se pone `stage_v4 = handoff_humano` en `clientes_crm_tania`: la IA solo contesta una línea de cortesía (foco de esa etapa).',
    '**Novedad v4**: con el bot apagado, el mensaje del lead SÍ se guarda como turno human (no se pierde historial).',
  ].join('\n'), [4840, -180], 460, 230));

  nodes.push(sticky('Sticky — caché Anthropic', [
    '## Caché (máx 4 breakpoints por request)',
    '- Breakpoints 1 y 2: dentro de `dist.system` (los 2 bloques system llevan `cache_control` ephemeral ttl 1h).',
    '- Breakpoint 3 (móvil): el compose lo pone en el ÚLTIMO bloque del PENÚLTIMO turno.',
    'Verificar en `tania_llm_calls`: desde la 2ª llamada de una conversación, `cache_read_input_tokens > 0`.',
    '',
    '**Audio/imagen**: este v4 NO transcribe; llegan como `[audio recibido]`. La rama Whisper del v3 se puede enchufar delante de `normalizar` más adelante.',
  ].join('\n'), [5960, -280], 460, 290));

  nodes.push(sticky('Sticky — envío + CRM + GHL', [
    '## Envío y post-proceso',
    '- Burbujas de 1 en 1 con pausa aleatoria 2-4s.',
    '- `guardar historial`: human = texto limpio de la ráfaga; ai = burbujas unidas con `\\n\\n`. Texto SIEMPRE limpio (nada de JSON v3).',
    '- `actualizar CRM`: slots con merge `||` (nunca pisa con null); `proximo_recontacto` según regla (link→+24h, activa→+48h, hito→fecha+1d, médico→+8d, cierre→NULL).',
    '- `espejo GHL`: escribe el stage VIEJO mapeado (const `GHL_STAGE_MAP` del nodo `parse`) en el custom field `' + GHL_STAGE_FIELD_ID + '`. `onError: continue` ⇒ un GHL caído no rompe el turno.',
    '- `notificar a Tania` está DESACTIVADO: configurar el destino real (WhatsApp de Tania vía plantilla YCloud, email, etc.) y activarlo.',
  ].join('\n'), [7700, -280], 540, 320));

  conn(cs, 'Webhook', 'normalizar');
  conn(cs, 'normalizar', '¿payload reconocido?');
  conn(cs, '¿payload reconocido?', '¿es opener?', 0);
  conn(cs, '¿payload reconocido?', 'fin: payload desconocido', 1);
  conn(cs, '¿es opener?', 'opener: upsert CRM', 0);
  conn(cs, '¿es opener?', 'dedup Redis (INCR≈SETNX)', 1);
  conn(cs, 'opener: upsert CRM', 'opener: historial (ai)');
  conn(cs, 'dedup Redis (INCR≈SETNX)', 'evaluar dedup');
  conn(cs, 'evaluar dedup', '¿duplicado?');
  conn(cs, '¿duplicado?', 'fin: duplicado', 0);
  conn(cs, '¿duplicado?', 'dedup persistente (Postgres)', 1);
  conn(cs, 'dedup persistente (Postgres)', '¿mensaje nuevo?');
  conn(cs, '¿mensaje nuevo?', 'buffer: RPUSH', 0);
  conn(cs, '¿mensaje nuevo?', 'fin: ya procesado', 1);
  conn(cs, 'buffer: RPUSH', 'buffer: SET last');
  conn(cs, 'buffer: SET last', 'esperar ráfaga (30s)');
  conn(cs, 'esperar ráfaga (30s)', 'leer last');
  conn(cs, 'leer last', '¿soy el último?');
  conn(cs, '¿soy el último?', 'leer ráfaga', 0);
  conn(cs, '¿soy el último?', 'fin: llegó otro mensaje', 1);
  conn(cs, 'leer ráfaga', 'borrar buffer');
  conn(cs, 'borrar buffer', 'lock: intento 1');
  conn(cs, 'lock: intento 1', '¿lock ok? (1)');
  conn(cs, '¿lock ok? (1)', 'boton_on/off (¿bot apagado?)', 0);
  conn(cs, '¿lock ok? (1)', 'esperar lock (10s)', 1);
  conn(cs, 'esperar lock (10s)', 'lock: intento 2');
  conn(cs, 'lock: intento 2', '¿lock ok? (2)');
  conn(cs, '¿lock ok? (2)', 'boton_on/off (¿bot apagado?)', 0);
  conn(cs, '¿lock ok? (2)', 'esperar lock 2 (10s)', 1);
  conn(cs, 'esperar lock 2 (10s)', 'lock: intento 3');
  conn(cs, 'lock: intento 3', '¿lock ok? (3)');
  conn(cs, '¿lock ok? (3)', 'boton_on/off (¿bot apagado?)', 0);
  conn(cs, '¿lock ok? (3)', 'fin: sesión bloqueada', 1);
  conn(cs, 'boton_on/off (¿bot apagado?)', 'bot off: guardar human', 0);
  conn(cs, 'boton_on/off (¿bot apagado?)', 'cargar crm', 1);
  conn(cs, 'bot off: guardar human', 'bot off: liberar lock');
  conn(cs, 'cargar crm', 'cargar historial');
  conn(cs, 'cargar historial', 'compose');
  conn(cs, 'compose', 'llamar Anthropic (Sonnet)');
  conn(cs, 'llamar Anthropic (Sonnet)', 'parse');
  conn(cs, 'parse', 'log LLM (tania_llm_calls)');
  conn(cs, 'log LLM (tania_llm_calls)', '¿hay burbujas?');
  conn(cs, '¿hay burbujas?', 'preparar burbujas', 0);
  conn(cs, '¿hay burbujas?', 'guardar historial', 1);
  conn(cs, 'preparar burbujas', 'burbujas (1 a 1)');
  conn(cs, 'burbujas (1 a 1)', 'guardar historial', 0);
  conn(cs, 'burbujas (1 a 1)', '¿canal?', 1);
  conn(cs, '¿canal?', 'enviar_texto (YCloud WA)', 0);
  conn(cs, '¿canal?', 'enviar_texto (ManyChat IG)', 1);
  conn(cs, 'enviar_texto (YCloud WA)', 'pausa humana (2-4s)');
  conn(cs, 'enviar_texto (ManyChat IG)', 'pausa humana (2-4s)');
  conn(cs, 'pausa humana (2-4s)', 'burbujas (1 a 1)');
  conn(cs, 'guardar historial', 'actualizar CRM');
  conn(cs, 'actualizar CRM', '¿tiene contact_id GHL?');
  conn(cs, '¿tiene contact_id GHL?', 'espejo GHL (stage)', 0);
  conn(cs, '¿tiene contact_id GHL?', 'liberar lock', 1);
  conn(cs, 'espejo GHL (stage)', 'liberar lock');
  conn(cs, 'liberar lock', '¿handoff humano?');
  conn(cs, '¿handoff humano?', 'notificar a Tania (CONFIGURAR)', 0);
  conn(cs, '¿handoff humano?', 'fin', 1);

  return workflow('Tania v4 — principal (IG + WA)', nodes, cs);
}

// ============================================================ WORKFLOW B
function buildSeguimiento() {
  const nodes = [];
  const cs = {};

  nodes.push(node('Cada 15 min', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 300],
    { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }));

  nodes.push(codeNode('¿hora Madrid?', [220, 300], [
    '// Gate horario: solo entre las 9:00 y las 21:00 Europe/Madrid (L-D).',
    "const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));",
    'return [{ json: { hora: hora, permitido: hora >= 9 && hora < 21 } }];',
  ]));
  nodes.push(ifNode('¿en horario?', [440, 300],
    { leftValue: '={{ $json.permitido === true }}', rightValue: '', operator: opBoolTrue }));
  nodes.push(node('fin: fuera de horario', 'n8n-nodes-base.noOp', 1, [660, 80], {}));

  nodes.push(pgQuery('candidatos', [660, 300], [
    '-- Leads con recontacto vencido y cupo de followups disponible.',
    '-- Caps por etapa: link_enviado 2; resto (post_conv / hito / derivado_medico) 1.',
    "-- booking_status: ademas de 'none', entran cancelled/no_show marcados 'reagenda'",
    '-- por el webhook de booking (si no, ese recontacto de +4h no se enviaria nunca).',
    'SELECT id, nombre, contact_id, slots, stage_v4, booking_status,',
    '       followups_enviados, recontacto_motivo,',
    "       (id LIKE '+%') AS es_whatsapp",
    'FROM public.clientes_crm_tania',
    'WHERE proximo_recontacto IS NOT NULL',
    '  AND proximo_recontacto <= now()',
    '  AND (',
    "    booking_status = 'none'",
    "    OR (booking_status IN ('cancelled', 'no_show') AND recontacto_motivo = 'reagenda')",
    '  )',
    "  AND stage_v4 IN ('conexion', 'descubrimiento', 'cualificacion', 'puente',",
    "                   'llamada_ofrecida', 'link_enviado', 'derivado_medico', 'en_espera_hito')",
    "  AND followups_enviados < (CASE WHEN stage_v4 = 'link_enviado' THEN 2 ELSE 1 END)",
    'ORDER BY proximo_recontacto ASC',
    'LIMIT 20;',
  ].join('\n'), null));

  nodes.push(node('leads (1 a 1)', 'n8n-nodes-base.splitInBatches', 3, [880, 300], { batchSize: 1, options: {} }));
  nodes.push(node('fin: ciclo completado', 'n8n-nodes-base.noOp', 1, [1100, 80], {}));

  nodes.push(pgQuery('últimos 12 turnos', [1100, 300], [
    'SELECT id, message, fecha_mensaje',
    'FROM public.n8n_chat_histories_tania',
    'WHERE session_id = $1',
    'ORDER BY id DESC',
    'LIMIT 12;',
  ].join('\n'), '={{ [ $json.id ] }}', { alwaysOutputData: true }));

  const composeSegLines = [
    '// ============================================================================',
    '// COMPOSE SEGUIMIENTO - historial corto limpio + contexto -> request Haiku.',
    '// DIST_SEGUIMIENTO: pegar el objeto completo de',
    '// prompts/tania/dist/tania-v4-seguimiento.system.json (lo genera el build de',
    '// prompts; mientras este a null, este nodo lanza error a proposito).',
    '// ============================================================================',
    'const DIST_SEGUIMIENTO = null; // << PEGAR AQUI prompts/tania/dist/tania-v4-seguimiento.system.json',
    '',
    'const ETAPAS_FOCO = ' + FOCO_JSON + ';',
    '',
    ...LIMPIEZA_LINES,
    '',
    "const cand = $('leads (1 a 1)').first().json;",
    'if (!DIST_SEGUIMIENTO || !Array.isArray(DIST_SEGUIMIENTO.system)) {',
    "  throw new Error('DIST_SEGUIMIENTO no configurado. Pega prompts/tania/dist/tania-v4-seguimiento.system.json en el nodo compose seguimiento.');",
    '}',
    '',
    'const rows = $input.all().map(function (i) { return i.json; }).filter(function (r) { return r && r.message; });',
    'rows.reverse(); // venian DESC -> cronologico',
    '',
    '// hora del ultimo mensaje del LEAD (para la ventana de 24h de WhatsApp)',
    'let ultHumanTs = null;',
    'for (const row of rows) {',
    '  let msg = row.message;',
    "  if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch (e) { continue; } }",
    "  if (msg && msg.type === 'human' && row.fecha_mensaje) ultHumanTs = row.fecha_mensaje;",
    '}',
    'const horasDesdeLead = ultHumanTs ? (Date.now() - new Date(ultHumanTs).getTime()) / 3600000 : null;',
    'const esWa = String(cand.id).startsWith(String.fromCharCode(43)); // "+"',
    'const dentroVentana = esWa && horasDesdeLead !== null && horasDesdeLead < 24;',
    '',
    'const merged = turnosDesdeHistorial(rows);',
    '',
    "const stage = cand.stage_v4 || 'conexion';",
    'const foco = ETAPAS_FOCO[stage] || ETAPAS_FOCO.conexion;',
    "const slots = (cand.slots && typeof cand.slots === 'object') ? cand.slots : {};",
    'const slotsLineas = Object.entries(slots)',
    "  .filter(function (e) { return e[1] !== null && e[1] !== undefined && String(e[1]).trim() !== ''; })",
    "  .map(function (e) { return '- ' + e[0] + ': ' + e[1]; });",
    'const f = fechaMadrid();',
    'const contexto = [',
    "  '<contexto_seguimiento>',",
    "  'FECHA: ' + f.iso + ' (' + f.dia + ')',",
    "  'ETAPA: ' + stage,",
    "  'FOCO: ' + foco,",
    "  'DATOS CONFIRMADOS:',",
    "].concat(slotsLineas.length ? slotsLineas : ['- (aún ninguno)']).concat([",
    "  'FOLLOWUPS YA ENVIADOS: ' + (cand.followups_enviados || 0),",
    "  'MOTIVO DEL RECONTACTO: ' + (cand.recontacto_motivo || 'post_conv'),",
    "  'HORAS DESDE EL ÚLTIMO MENSAJE DEL LEAD: ' + (horasDesdeLead === null ? 'desconocido' : Math.round(horasDesdeLead)),",
    "  '</contexto_seguimiento>',",
    "  '',",
    "  '[Genera el toque de seguimiento ahora, o mensaje=null si no procede.]',",
    "]).join('\\n');",
    '',
    '// el ultimo mensaje del request debe ser user: el contexto va como turno user final',
    'const messages = merged.map(function (t) { return { role: t.role, content: t.text }; });',
    "if (messages.length && messages[messages.length - 1].role === 'user') {",
    "  messages[messages.length - 1].content += '\\n\\n' + contexto;",
    '} else {',
    "  messages.push({ role: 'user', content: contexto });",
    '}',
    '',
    'return [{ json: {',
    "  model: DIST_SEGUIMIENTO.model || 'claude-haiku-4-5',",
    '  max_tokens: DIST_SEGUIMIENTO.max_tokens || 512,',
    '  system_blocks: DIST_SEGUIMIENTO.system,',
    '  messages: messages,',
    '  session_id: cand.id,',
    '  nombre: cand.nombre || null,',
    '  stage_v4: stage,',
    '  es_whatsapp: esWa,',
    '  enviar_plantilla: esWa && !dentroVentana,',
    "  canal: esWa ? 'whatsapp' : 'instagram',",
    '} }];',
  ];
  nodes.push(codeNode('compose seguimiento', [1320, 300], composeSegLines));

  const toqueTool = [
    '    {',
    '      "name": "toque_seguimiento",',
    '      "description": "Devuelve el toque de seguimiento a enviar al lead, o mensaje=null si no procede enviar nada este ciclo.",',
    '      "strict": true,',
    '      "input_schema": {',
    '        "type": "object",',
    '        "additionalProperties": false,',
    '        "required": ["mensaje"],',
    '        "properties": {',
    '          "mensaje": {',
    '            "type": ["string", "null"],',
    '            "description": "Texto del toque (máx 300 caracteres), en la voz de Tania, anclado al último dato real del lead. Nunca reprochar ni preguntar si leyó el mensaje. null = no enviar nada."',
    '          }',
    '        }',
    '      }',
    '    }',
  ].join('\n');
  nodes.push(node('llamar Anthropic (Haiku)', 'n8n-nodes-base.httpRequest', 4.3, [1540, 300], {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "model": {{ JSON.stringify($json.model) }},',
      '  "max_tokens": {{ $json.max_tokens }},',
      '  "thinking": { "type": "disabled" },',
      '  "system": {{ JSON.stringify($json.system_blocks) }},',
      '  "tools": [',
      toqueTool,
      '  ],',
      '  "tool_choice": { "type": "tool", "name": "toque_seguimiento", "disable_parallel_tool_use": true },',
      '  "messages": {{ JSON.stringify($json.messages) }}',
      '}',
    ].join('\n'),
    options: { timeout: 60000 },
  }, { credentials: CRED_ANTHROPIC, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }));

  nodes.push(codeNode('parse seguimiento', [1760, 300], [
    'const res = $input.first().json;',
    "const comp = $('compose seguimiento').first().json;",
    ...CLAMP_LINES,
    "const block = (res.content || []).find(function (b) { return b.type === 'tool_use' && b.name === 'toque_seguimiento'; });",
    'let mensaje = null;',
    "if (block && block.input && typeof block.input.mensaje === 'string' && block.input.mensaje.trim()) {",
    '  mensaje = clamp300(block.input.mensaje);',
    '}',
    'const usage = res.usage || {};',
    'return [{ json: {',
    '  mensaje: mensaje,',
    '  hay_mensaje: !!mensaje,',
    '  session_id: comp.session_id,',
    '  canal: comp.canal,',
    '  model: comp.model,',
    '  stage_v4: comp.stage_v4,',
    '  input_tokens: usage.input_tokens != null ? usage.input_tokens : null,',
    '  output_tokens: usage.output_tokens != null ? usage.output_tokens : null,',
    '  cache_creation_input_tokens: usage.cache_creation_input_tokens != null ? usage.cache_creation_input_tokens : null,',
    '  cache_read_input_tokens: usage.cache_read_input_tokens != null ? usage.cache_read_input_tokens : null,',
    '  stop_reason: res.stop_reason || null,',
    '} }];',
  ]));

  nodes.push(pgQuery('log LLM (seguimiento)', [1980, 300], [
    'INSERT INTO public.tania_llm_calls',
    '  (session_id, canal, workflow, model, input_tokens, output_tokens,',
    '   cache_creation_input_tokens, cache_read_input_tokens, stop_reason,',
    '   stage_v4, num_burbujas)',
    "VALUES ($1, $2, 'seguimiento', $3, $4, $5, $6, $7, $8, $9, $10)",
    'RETURNING id;',
  ].join('\n'), "={{ [ $json.session_id, $json.canal, $json.model, $json.input_tokens, $json.output_tokens, $json.cache_creation_input_tokens, $json.cache_read_input_tokens, $json.stop_reason, $json.stage_v4, $json.hay_mensaje ? 1 : 0 ] }}"));

  nodes.push(ifNode('¿hay mensaje?', [2200, 300],
    { leftValue: "={{ $('parse seguimiento').first().json.hay_mensaje === true }}", rightValue: '', operator: opBoolTrue }));

  nodes.push(pgQuery('posponer sin enviar', [2420, 560], [
    '-- El modelo decidio no tocar al lead: se pospone 24h SIN gastar cupo de followups.',
    'UPDATE public.clientes_crm_tania',
    "SET proximo_recontacto = now() + interval '24 hours',",
    "    recontacto_motivo = 'skip_llm'",
    'WHERE id = $1',
    'RETURNING id;',
  ].join('\n'), "={{ [ $('parse seguimiento').first().json.session_id ] }}"));

  nodes.push(ifNode('¿WA fuera de ventana 24h?', [2420, 140],
    { leftValue: "={{ $('compose seguimiento').first().json.enviar_plantilla === true }}", rightValue: '', operator: opBoolTrue }));

  nodes.push(node('enviar plantilla (YCloud)', 'n8n-nodes-base.httpRequest', 4.3, [2640, 40], {
    method: 'POST',
    url: 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "from": "' + WA_BUSINESS + '",',
      '  "to": "{{ $(\'parse seguimiento\').first().json.session_id }}",',
      '  "type": "template",',
      '  "template": {',
      '    "name": "PLANTILLA_SEGUIMIENTO_TANIA",',
      '    "language": { "code": "es", "policy": "deterministic" },',
      '    "components": [',
      '      {',
      '        "type": "body",',
      '        "parameters": [',
      '          { "type": "text", "text": {{ JSON.stringify(($(\'compose seguimiento\').first().json.nombre || \'hola\').split(\' \')[0]) }} }',
      '        ]',
      '      }',
      '    ]',
      '  }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_YCLOUD, onError: 'continueErrorOutput' }));
  nodes.push(node('plantilla no configurada', 'n8n-nodes-base.noOp', 1, [2860, -80], {}));

  nodes.push(switchNode('¿canal? (seguimiento)', [2640, 240], "={{ $('compose seguimiento').first().json.canal }}",
    [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram']]));

  nodes.push(node('enviar_texto (YCloud) seg', 'n8n-nodes-base.httpRequest', 4.3, [2860, 160], {
    method: 'POST',
    url: 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "from": "' + WA_BUSINESS + '",',
      '  "to": "{{ $(\'parse seguimiento\').first().json.session_id }}",',
      '  "type": "text",',
      '  "text": { "body": {{ JSON.stringify($(\'parse seguimiento\').first().json.mensaje) }}, "preview_url": true }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_YCLOUD }));

  nodes.push(node('enviar_texto (ManyChat) seg', 'n8n-nodes-base.httpRequest', 4.3, [2860, 340], {
    method: 'POST',
    url: 'https://api.manychat.com/fb/sending/sendContent',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "subscriber_id": "{{ $(\'parse seguimiento\').first().json.session_id }}",',
      '  "data": {',
      '    "version": "v2",',
      '    "content": {',
      '      "type": "instagram",',
      '      "messages": [ { "type": "text", "text": {{ JSON.stringify($(\'parse seguimiento\').first().json.mensaje) }} } ]',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_MANYCHAT }));

  nodes.push(pgQuery('guardar historial (seg)', [3080, 240], [
    '-- El toque queda en el historial como turno ai con el texto LITERAL enviado.',
    'INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "VALUES ($1, jsonb_build_object('type', 'ai', 'content', $2::text), now())",
    'RETURNING id;',
  ].join('\n'), "={{ [ $('parse seguimiento').first().json.session_id, $('parse seguimiento').first().json.mensaje ] }}",
    { executeOnce: true }));

  nodes.push(pgQuery('actualizar contador', [3300, 240], [
    '-- Incrementa followups; al agotar el cap (link_enviado: 2, resto: 1) el lead pasa a',
    "-- stage_v4 = 'dormido' y proximo_recontacto = NULL. NUNCA se borra nada.",
    'UPDATE public.clientes_crm_tania c SET',
    '  followups_enviados = c.followups_enviados + 1,',
    '  ultimo_followup_at = now(),',
    "  stage_v4 = CASE WHEN c.followups_enviados + 1 >= (CASE WHEN c.stage_v4 = 'link_enviado' THEN 2 ELSE 1 END)",
    "                  THEN 'dormido' ELSE c.stage_v4 END,",
    "  proximo_recontacto = CASE WHEN c.followups_enviados + 1 >= (CASE WHEN c.stage_v4 = 'link_enviado' THEN 2 ELSE 1 END)",
    "                            THEN NULL ELSE now() + interval '48 hours' END,",
    "  recontacto_motivo = CASE WHEN c.followups_enviados + 1 >= (CASE WHEN c.stage_v4 = 'link_enviado' THEN 2 ELSE 1 END)",
    '                           THEN NULL ELSE c.recontacto_motivo END',
    'WHERE c.id = $1',
    'RETURNING c.id, c.stage_v4, c.followups_enviados, c.proximo_recontacto;',
  ].join('\n'), "={{ [ $('parse seguimiento').first().json.session_id ] }}", { executeOnce: true }));

  nodes.push(node('pausa entre leads (3s)', 'n8n-nodes-base.wait', 1.1, [3520, 300], { amount: 3 }, { webhookId: uuid() }));

  nodes.push(sticky('Sticky — seguimiento v4', [
    '## Tania v4 — seguimiento',
    'Sustituye a `seguimiento_tania` (que no usaba LLM y BORRABA leads a las 72h — aquí NUNCA se borra nada).',
    '',
    'Cada 15 min (gate 9-21h Europe/Madrid): lee candidatos con `proximo_recontacto` vencido, y por cada uno Haiku decide el toque con el tool `toque_seguimiento` (mensaje o null).',
    '',
    '**Caps**: link_enviado 2 toques; conversación/hito/derivado_medico 1. Al agotar → `stage_v4=dormido`, `proximo_recontacto=NULL`.',
    '**null del modelo** → se pospone 24h sin gastar cupo.',
  ].join('\n'), [0, -260], 480, 300));

  nodes.push(sticky('Sticky — pegar dist seguimiento', [
    '## Qué pegar',
    '- Nodo `compose seguimiento` → `DIST_SEGUIMIENTO`: pegar `prompts/tania/dist/tania-v4-seguimiento.system.json` **(lo genera el build de prompts; si aún no existe, generar antes de activar este workflow)**.',
    '- `ETAPAS_FOCO` ya viene copiado de `prompts/tania/tools/etapas-foco.json` (re-pegar si cambia).',
    '- Modelo: lo trae el dist (`claude-haiku-4-5`).',
  ].join('\n'), [1280, -220], 460, 240));

  nodes.push(sticky('Sticky — ventana 24h WA', [
    '## WhatsApp fuera de ventana de 24h',
    'Meta solo permite texto libre dentro de las 24h siguientes al último mensaje del lead. Fuera de ventana ⇒ rama de PLANTILLA.',
    '',
    '⚠️ Requiere una plantilla aprobada en Meta (vía YCloud). Sustituir `PLANTILLA_SEGUIMIENTO_TANIA` por el nombre real y ajustar variables/idioma.',
    'Mientras no exista, esa rama falla → sale por la salida de error → NO se marca followup (correcto: no se envió nada).',
  ].join('\n'), [2640, -260], 460, 260));

  conn(cs, 'Cada 15 min', '¿hora Madrid?');
  conn(cs, '¿hora Madrid?', '¿en horario?');
  conn(cs, '¿en horario?', 'candidatos', 0);
  conn(cs, '¿en horario?', 'fin: fuera de horario', 1);
  conn(cs, 'candidatos', 'leads (1 a 1)');
  conn(cs, 'leads (1 a 1)', 'fin: ciclo completado', 0);
  conn(cs, 'leads (1 a 1)', 'últimos 12 turnos', 1);
  conn(cs, 'últimos 12 turnos', 'compose seguimiento');
  conn(cs, 'compose seguimiento', 'llamar Anthropic (Haiku)');
  conn(cs, 'llamar Anthropic (Haiku)', 'parse seguimiento');
  conn(cs, 'parse seguimiento', 'log LLM (seguimiento)');
  conn(cs, 'log LLM (seguimiento)', '¿hay mensaje?');
  conn(cs, '¿hay mensaje?', '¿WA fuera de ventana 24h?', 0);
  conn(cs, '¿hay mensaje?', 'posponer sin enviar', 1);
  conn(cs, 'posponer sin enviar', 'pausa entre leads (3s)');
  conn(cs, '¿WA fuera de ventana 24h?', 'enviar plantilla (YCloud)', 0);
  conn(cs, '¿WA fuera de ventana 24h?', '¿canal? (seguimiento)', 1);
  conn(cs, 'enviar plantilla (YCloud)', 'guardar historial (seg)', 0);
  conn(cs, 'enviar plantilla (YCloud)', 'plantilla no configurada', 1);
  conn(cs, 'plantilla no configurada', 'pausa entre leads (3s)');
  conn(cs, '¿canal? (seguimiento)', 'enviar_texto (YCloud) seg', 0);
  conn(cs, '¿canal? (seguimiento)', 'enviar_texto (ManyChat) seg', 1);
  conn(cs, 'enviar_texto (YCloud) seg', 'guardar historial (seg)');
  conn(cs, 'enviar_texto (ManyChat) seg', 'guardar historial (seg)');
  conn(cs, 'guardar historial (seg)', 'actualizar contador');
  conn(cs, 'actualizar contador', 'pausa entre leads (3s)');
  conn(cs, 'pausa entre leads (3s)', 'leads (1 a 1)');

  return workflow('Tania v4 — seguimiento', nodes, cs);
}

// ============================================================ WORKFLOW C
function buildBooking() {
  const nodes = [];
  const cs = {};

  nodes.push(node('Webhook booking', 'n8n-nodes-base.webhook', 2.1, [0, 300],
    { httpMethod: 'POST', path: 'tania-v4-booking', options: {} }, { webhookId: uuid() }));

  nodes.push(codeNode('normalizar booking', [220, 300], [
    '// Payload esperado (workflow nativo de GHL -> Custom Webhook):',
    '//   { "contact_id": "...", "start_time": "2026-08-01T17:00:00+02:00", "tipo": "booked|cancelled|no_show" }',
    '// Se toleran variantes de nombre y los tipos nativos de GHL (AppointmentCreate...).',
    'const body = $json.body || {};',
    'const contactId = body.contact_id || body.contactId || (body.contact && body.contact.id) || null;',
    'const startTime = body.start_time || body.startTime || (body.calendar && body.calendar.startTime) || null;',
    "let tipo = String(body.tipo || body.type || body.event || body.status || '').toLowerCase();",
    "if (/(no.?show)/.test(tipo)) tipo = 'no_show';",
    "else if (/(cancel)/.test(tipo)) tipo = 'cancelled';",
    "else if (/(book|creat|confirm)/.test(tipo)) tipo = 'booked';",
    "else tipo = 'desconocido';",
    'return [{ json: { contact_id: contactId, start_time: startTime, tipo: tipo } }];',
  ]));

  nodes.push(ifNode('¿datos válidos?', [440, 300],
    { leftValue: "={{ !!$json.contact_id && $json.tipo !== 'desconocido' }}", rightValue: '', operator: opBoolTrue }));
  nodes.push(node('fin: payload inválido', 'n8n-nodes-base.noOp', 1, [660, 80], {}));

  nodes.push(switchNode('¿tipo de evento?', [660, 300], '={{ $json.tipo }}',
    [['booked', 'Booked'], ['cancelled', 'Cancelled'], ['no_show', 'NoShow']]));

  nodes.push(pgQuery('crm: agendado', [880, 140], [
    '-- Reserva creada: F(agendado) + booking_status=booked + se apaga el seguimiento.',
    '-- pipeline_stage tambien a agendado (espejo del custom field viejo de GHL).',
    'UPDATE public.clientes_crm_tania',
    "SET booking_status = 'booked',",
    "    stage_v4 = 'agendado',",
    "    pipeline_stage = 'agendado',",
    '    proximo_recontacto = NULL,',
    '    recontacto_motivo = NULL',
    'WHERE contact_id = $1',
    'RETURNING id, nombre;',
  ].join('\n'), "={{ [ $('normalizar booking').first().json.contact_id ] }}", { alwaysOutputData: true }));

  nodes.push(ifNode('¿lead encontrado?', [1100, 140],
    { leftValue: "={{ ($json.id || '') + '' }}", rightValue: '', operator: opNotEmpty }));
  nodes.push(node('fin: contacto sin lead', 'n8n-nodes-base.noOp', 1, [1320, -20], {}));

  nodes.push(codeNode('mensaje confirmación', [1320, 140], [
    '// Plantilla fija calida de confirmacion, con la fecha bonita en es-ES (hora Madrid).',
    'const lead = $input.first().json;',
    "const start = $('normalizar booking').first().json.start_time;",
    "let fechaBonita = '';",
    'if (start) {',
    '  const d = new Date(start);',
    "  if (!isNaN(d.getTime())) fechaBonita = d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });",
    '}',
    "const nombre = String(lead.nombre || '').split(' ')[0];",
    "const texto = (nombre ? nombre + ', ' : '') +",
    "  '¡reserva confirmada! 🎉 Tu videollamada con Tania queda agendada' +",
    "  (fechaBonita ? ' para el ' + fechaBonita + ' (hora España)' : '') +",
    "  '. Si te surge cualquier cosa antes, escríbeme por aquí. ¡Nos vemos muy pronto! 💛';",
    'return [{ json: {',
    '  id: lead.id,',
    '  texto: texto,',
    '  es_whatsapp: String(lead.id).startsWith(String.fromCharCode(43)),',
    '} }];',
  ]));

  nodes.push(ifNode('¿es WhatsApp?', [1540, 140],
    { leftValue: '={{ $json.es_whatsapp === true }}', rightValue: '', operator: opBoolTrue }));

  nodes.push(node('confirmación WA (YCloud)', 'n8n-nodes-base.httpRequest', 4.3, [1760, 40], {
    method: 'POST',
    url: 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "from": "' + WA_BUSINESS + '",',
      '  "to": "{{ $(\'mensaje confirmación\').first().json.id }}",',
      '  "type": "text",',
      '  "text": { "body": {{ JSON.stringify($(\'mensaje confirmación\').first().json.texto) }}, "preview_url": false }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_YCLOUD }));

  nodes.push(node('confirmación IG (ManyChat)', 'n8n-nodes-base.httpRequest', 4.3, [1760, 240], {
    method: 'POST',
    url: 'https://api.manychat.com/fb/sending/sendContent',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: [
      '={',
      '  "subscriber_id": "{{ $(\'mensaje confirmación\').first().json.id }}",',
      '  "data": {',
      '    "version": "v2",',
      '    "content": {',
      '      "type": "instagram",',
      '      "messages": [ { "type": "text", "text": {{ JSON.stringify($(\'mensaje confirmación\').first().json.texto) }} } ]',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    options: {},
  }, { credentials: CRED_MANYCHAT }));

  nodes.push(pgQuery('historial confirmación (ai)', [1980, 140], [
    'INSERT INTO public.n8n_chat_histories_tania (session_id, message, fecha_mensaje)',
    "VALUES ($1, jsonb_build_object('type', 'ai', 'content', $2::text), now())",
    'RETURNING id;',
  ].join('\n'), "={{ [ $('mensaje confirmación').first().json.id, $('mensaje confirmación').first().json.texto ] }}",
    { executeOnce: true }));

  nodes.push(pgQuery('crm: cancelada', [880, 440], [
    '-- Cancelacion: se reactiva el seguimiento a +4h con motivo reagenda.',
    '-- (la query de candidatos del workflow de seguimiento admite cancelled/no_show + reagenda)',
    'UPDATE public.clientes_crm_tania',
    "SET booking_status = 'cancelled',",
    "    proximo_recontacto = now() + interval '4 hours',",
    "    recontacto_motivo = 'reagenda'",
    'WHERE contact_id = $1',
    'RETURNING id;',
  ].join('\n'), "={{ [ $('normalizar booking').first().json.contact_id ] }}", { alwaysOutputData: true }));

  nodes.push(pgQuery('crm: no acudió', [880, 640], [
    '-- No-show: igual que cancelacion, recontacto de reagenda a +4h.',
    'UPDATE public.clientes_crm_tania',
    "SET booking_status = 'no_show',",
    "    proximo_recontacto = now() + interval '4 hours',",
    "    recontacto_motivo = 'reagenda'",
    'WHERE contact_id = $1',
    'RETURNING id;',
  ].join('\n'), "={{ [ $('normalizar booking').first().json.contact_id ] }}", { alwaysOutputData: true }));

  nodes.push(sticky('Sticky — booking webhook', [
    '## Tania v4 — booking webhook',
    'Recibe los eventos de cita desde un **workflow nativo de GHL** (trigger Appointment) que hace POST a `/webhook/tania-v4-booking` con Custom Webhook y este body:',
    '```json',
    '{ "contact_id": "{{contact.id}}", "start_time": "{{appointment.start_time}}", "tipo": "booked" }',
    '```',
    'Crear 3 workflows en GHL (o uno con ramas): Appointment Created → tipo `booked`; Cancelled → `cancelled`; No Show → `no_show`.',
    '',
    '- `booked` ⇒ `stage_v4=agendado`, seguimiento apagado, mensaje cálido de confirmación con fecha + turno ai en historial.',
    '- `cancelled` / `no_show` ⇒ `booking_status` correspondiente + recontacto de **reagenda a +4h** (lo envía el workflow de seguimiento).',
  ].join('\n'), [0, -280], 520, 330));

  nodes.push(sticky('Sticky — número emisor WA', [
    '## Número emisor WhatsApp',
    'Los envíos YCloud usan `from = ' + WA_BUSINESS + '` (el número Business de Tania observado en los webhooks del workflow vivo). **Confirmar antes de activar.**',
    'El matching del lead es por `contact_id` de GHL → columna `clientes_crm_tania.contact_id`. Canal: id que empieza por `+` = WhatsApp; si no, Instagram (subscriber de ManyChat).',
  ].join('\n'), [1540, -240], 460, 220));

  conn(cs, 'Webhook booking', 'normalizar booking');
  conn(cs, 'normalizar booking', '¿datos válidos?');
  conn(cs, '¿datos válidos?', '¿tipo de evento?', 0);
  conn(cs, '¿datos válidos?', 'fin: payload inválido', 1);
  conn(cs, '¿tipo de evento?', 'crm: agendado', 0);
  conn(cs, '¿tipo de evento?', 'crm: cancelada', 1);
  conn(cs, '¿tipo de evento?', 'crm: no acudió', 2);
  conn(cs, 'crm: agendado', '¿lead encontrado?');
  conn(cs, '¿lead encontrado?', 'mensaje confirmación', 0);
  conn(cs, '¿lead encontrado?', 'fin: contacto sin lead', 1);
  conn(cs, 'mensaje confirmación', '¿es WhatsApp?');
  conn(cs, '¿es WhatsApp?', 'confirmación WA (YCloud)', 0);
  conn(cs, '¿es WhatsApp?', 'confirmación IG (ManyChat)', 1);
  conn(cs, 'confirmación WA (YCloud)', 'historial confirmación (ai)');
  conn(cs, 'confirmación IG (ManyChat)', 'historial confirmación (ai)');

  return workflow('Tania v4 — booking webhook', nodes, cs);
}

// ============================================================ emit
const out = [
  ['tania-v4-principal.json', buildPrincipal()],
  ['tania-v4-seguimiento.json', buildSeguimiento()],
  ['tania-v4-booking-webhook.json', buildBooking()],
];
for (const [file, wf] of out) {
  const p = path.join(OUT_DIR, file);
  fs.writeFileSync(p, JSON.stringify(wf, null, 2) + '\n');
  console.log('OK', file, '-', wf.nodes.length, 'nodos');
}
