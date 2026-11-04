#!/usr/bin/env node
/**
 * test-rls-anon-leaks.mjs (Hardening 2026-05-15; sondas de escritura 2026-11-04)
 *
 * Parte 1 — anon. Valida empíricamente que las tablas con RLS no devuelven datos al
 * rol anon. Si alguna devuelve filas, RLS está roto y hay leak crítico cross-tenant.
 * (Hoy anon ni siquiera puede ejecutar tenant_id_for_user(): la respuesta es
 * HTTP 401 con code 42501 "permission denied for function". Eso también es "no leak".)
 *
 * Parte 2 — sesión de usuario (OPCIONAL, solo si se pasa un JWT). Comprueba que un
 * usuario autenticado NO puede escribir tenant_configs / prompt_blocks / resources
 * desde PostgREST (migration 086). Las sondas están diseñadas para NO escribir nunca,
 * ni siquiera cuando la policy está abierta: cada UPDATE pone a NULL una columna
 * NOT NULL y cada INSERT omite columnas NOT NULL. PostgreSQL evalúa la policy
 * (WITH CHECK) ANTES de las constraints, así que:
 *   - code 42501 ("new row violates row-level security") → la policy denegó → OK.
 *   - 0 filas en un UPDATE                                → la policy ocultó la fila → OK.
 *   - code 23502 / 23514 / 23505 (not-null / check / unique) → la policy DEJÓ PASAR la
 *     escritura y solo la paró la constraint → FAIL (agujero abierto).
 *   - filas devueltas en un UPDATE/INSERT → se escribió de verdad → FAIL ruidoso.
 * No hay sonda DELETE: un DELETE que la policy permita borra de verdad.
 *
 * Migration 088 (profiles): mismas sondas sobre `profiles`. is_agency_admin y role son
 * NOT NULL, así que ponerlos a null nunca escribe: antes de la 088 responde 23502 (la
 * policy dejó pasar), después 42501 (REVOKE UPDATE por columna) o 0 filas (fila ajena).
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *     node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
 *
 *   # Con sondas de escritura autenticadas (usar un usuario de PRUEBA, idealmente viewer):
 *   RLS_TEST_USER_JWT=<access_token> node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
 *   # o dejar que el script haga el sign-in:
 *   RLS_TEST_USER_EMAIL=... RLS_TEST_USER_PASSWORD=... node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
 *
 * Exit code 0 si todos los controles pasan, 1 si hay leaks o escrituras abiertas,
 * 2 si falta configuración.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Best-effort cargar .env.local — el script vive en apps/motor-agente/test/security/
// y .env.local está en apps/panel/.env.local desde la raíz del repo.
const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(__dirname, '../../../panel/.env.local'),
  resolve(process.cwd(), 'apps/panel/.env.local'),
  resolve(process.cwd(), '.env.local'),
];
for (const envPath of candidates) {
  try {
    const txt = readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  } catch {
    /* keep trying */
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('Set them in apps/panel/.env.local or export them.');
  process.exit(2);
}

const TABLES_TO_PROBE = [
  'pipeline_runs',
  'automation_keywords',
  'v_tenant_health',
  'tenant_tokens',
  'integration_accounts',
  'conversations',
  'leads',
  'conversation_messages',
  'calendar_accounts',
  'calendar_appointments',
  'prompt_block_versions',
  'lead_form_submissions',
  'unmatched_openings',
  // Migration 086: solo lectura para la sesión; anon sigue sin ver nada.
  'tenant_configs',
  'prompt_blocks',
  'resources',
];

const RPC_FUNCTIONS_DENIED = [
  'provision_tenant',
  'log_phase_change',
  'cancel_followups_on_lead_reply',
  'seed_system_labels_on_new_tenant',
];

async function probeTable(name) {
  const url = `${SUPABASE_URL}/rest/v1/${name}?limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const ok = res.ok;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json response */
  }
  return { name, status: res.status, ok, rowsReturned: Array.isArray(data) ? data.length : 'n/a', data };
}

async function probeRpc(name) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });
  return { name, status: res.status };
}

// ---------------------------------------------------------------------------
// Parte 2 — sondas de escritura con sesión de usuario (migration 086)
// ---------------------------------------------------------------------------

async function obtainUserJwt() {
  if (process.env.RLS_TEST_USER_JWT) return process.env.RLS_TEST_USER_JWT;
  const email = process.env.RLS_TEST_USER_EMAIL;
  const password = process.env.RLS_TEST_USER_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  if (!res.ok || !json?.access_token) {
    throw new Error(
      `sign-in del usuario de prueba falló: HTTP ${res.status} ${json?.error_description ?? json?.msg ?? ''}`,
    );
  }
  return json.access_token;
}

function decodeJwtSub(jwt) {
  const payload = jwt.split('.')[1] ?? '';
  const json = JSON.parse(
    Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  );
  return json.sub ?? null;
}

async function rest(jwt, method, path, body, prefer) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 204 / non-json */
  }
  return { status: res.status, data };
}

/**
 * Clasifica la respuesta de una sonda de escritura.
 *   'closed'   → RLS denegó (42501) o no vio la fila (0 filas / 204).
 *   'open'     → la policy dejó pasar y solo paró la constraint (23502/23514/23505).
 *   'WROTE'    → devolvió filas: la escritura se produjo. No debería poder pasar.
 *   'unknown'  → cualquier otra cosa (red, 5xx, columna inexistente...).
 */
function classifyWrite({ status, data }) {
  if (data && typeof data === 'object' && !Array.isArray(data) && data.code) {
    if (data.code === '42501') return 'closed';
    if (['23502', '23514', '23505'].includes(data.code)) return 'open';
    return 'unknown';
  }
  if (status === 204) return 'closed';
  if (Array.isArray(data)) return data.length === 0 ? 'closed' : 'WROTE';
  return 'unknown';
}

function describeWrite(r) {
  const code = r.data && !Array.isArray(r.data) ? r.data.code : undefined;
  const rows = Array.isArray(r.data) ? r.data.length : undefined;
  return `HTTP ${r.status}${code ? ` code=${code}` : ''}${rows !== undefined ? ` rows=${rows}` : ''}`;
}

async function runAuthenticatedWriteProbes(jwt, counters) {
  const sub = decodeJwtSub(jwt);
  if (!sub) {
    console.log('  ! el JWT no trae sub; se omiten las sondas autenticadas');
    return;
  }

  const prof = await rest(jwt, 'GET', `profiles?select=tenant_id,role,is_agency_admin&id=eq.${sub}`);
  const me = Array.isArray(prof.data) ? prof.data[0] : null;
  if (!me?.tenant_id) {
    console.log(`  ! no se pudo leer el profile del usuario de prueba (${describeWrite(prof)}); se omiten las sondas`);
    return;
  }
  const tid = me.tenant_id;
  console.log(`  usuario: tenant_id=${tid} role=${me.role} is_agency_admin=${me.is_agency_admin}`);
  if (me.is_agency_admin) {
    console.log('  ! el usuario es agency admin: usa un viewer/owner de un tenant para que la sonda sea representativa');
  }

  // Lectura propia: tiene que seguir funcionando tras la 086 (no romper el panel).
  const readCfg = await rest(jwt, 'GET', `tenant_configs?select=tenant_id&tenant_id=eq.${tid}`);
  const cfgVisible = Array.isArray(readCfg.data) && readCfg.data.length > 0;
  if (readCfg.data && !Array.isArray(readCfg.data) && readCfg.data.code) {
    console.log(`  X FAIL read tenant_configs (own): ${describeWrite(readCfg)}  <-- la lectura propia falla`);
    counters.fail++;
  } else {
    console.log(`  OK read tenant_configs (own): ${cfgVisible ? 'visible' : 'sin fila (tenant sin config)'}`);
    counters.pass++;
  }

  const probes = [];

  // UPDATE propio de tenant_configs: timezone es NOT NULL.
  if (cfgVisible) {
    probes.push({
      label: 'UPDATE tenant_configs (own row)',
      run: () =>
        rest(jwt, 'PATCH', `tenant_configs?tenant_id=eq.${tid}`, { timezone: null }, 'return=representation'),
    });
  } else {
    console.log('  - SKIP UPDATE tenant_configs (own row): no hay fila visible que actualizar');
  }

  // UPDATE propio de prompt_blocks: content es NOT NULL.
  const blocks = await rest(jwt, 'GET', `prompt_blocks?select=id,block_key&tenant_id=eq.${tid}&limit=1`);
  const block = Array.isArray(blocks.data) ? blocks.data[0] : null;
  if (block?.id) {
    probes.push({
      label: `UPDATE prompt_blocks (own ${block.block_key})`,
      run: () =>
        rest(jwt, 'PATCH', `prompt_blocks?id=eq.${block.id}`, { content: null }, 'return=representation'),
    });
  } else {
    console.log('  - SKIP UPDATE prompt_blocks (own): el tenant no tiene bloques visibles');
  }

  // UPDATE de un bloque compartido: nadie salvo service_role, antes y después.
  probes.push({
    label: 'UPDATE prompt_blocks (shared core_v5_base)',
    run: () =>
      rest(
        jwt,
        'PATCH',
        'prompt_blocks?tenant_id=is.null&block_key=eq.core_v5_base',
        { content: null },
        'return=representation',
      ),
  });

  // INSERT: se omiten columnas NOT NULL; la PK de tenant_configs es segunda red.
  probes.push({
    label: 'INSERT tenant_configs',
    run: () => rest(jwt, 'POST', 'tenant_configs', { tenant_id: tid, timezone: null }, 'return=representation'),
  });
  probes.push({
    label: 'INSERT prompt_blocks',
    run: () => rest(jwt, 'POST', 'prompt_blocks', { tenant_id: tid, content: null }, 'return=representation'),
  });
  probes.push({
    label: 'INSERT resources',
    run: () => rest(jwt, 'POST', 'resources', { tenant_id: tid, name: null }, 'return=representation'),
  });

  // --- profiles (migration 088): columnas de privilegio y filas ajenas ------------------
  // is_agency_admin y role son NOT NULL: ponerlos a null nunca escribe. Pre-088 la policy
  // dejaba pasar y lo paraba la constraint (23502 → OPEN); post-088 lo para el REVOKE de
  // columna (42501) y, en la fila de un compañero, la policy (0 filas).
  probes.push({
    label: 'UPDATE profiles (own row) is_agency_admin',
    run: () =>
      rest(jwt, 'PATCH', `profiles?id=eq.${sub}`, { is_agency_admin: null }, 'return=representation'),
  });
  probes.push({
    label: 'UPDATE profiles (own row) role',
    run: () => rest(jwt, 'PATCH', `profiles?id=eq.${sub}`, { role: null }, 'return=representation'),
  });
  const other = await rest(jwt, 'GET', `profiles?select=id&tenant_id=eq.${tid}&id=neq.${sub}&limit=1`);
  const otherId = Array.isArray(other.data) ? other.data[0]?.id : null;
  if (otherId) {
    probes.push({
      label: 'UPDATE profiles (other member) is_agency_admin',
      run: () =>
        rest(jwt, 'PATCH', `profiles?id=eq.${otherId}`, { is_agency_admin: null }, 'return=representation'),
    });
  } else {
    console.log('  - SKIP UPDATE profiles (other member): el tenant no tiene más miembros visibles');
  }

  for (const p of probes) {
    const r = await p.run();
    const verdict = classifyWrite(r);
    if (verdict === 'closed') {
      console.log(`  OK ${p.label}: ${describeWrite(r)}`);
      counters.pass++;
    } else if (verdict === 'open') {
      console.log(`  X OPEN ${p.label}: ${describeWrite(r)}  <-- la policy dejó pasar la escritura (la paró la constraint)`);
      counters.fail++;
    } else if (verdict === 'WROTE') {
      console.log(`  X WROTE ${p.label}: ${describeWrite(r)}  <-- SE ESCRIBIÓ DE VERDAD, revisar la fila YA`);
      counters.fail++;
    } else {
      console.log(`  ? ${p.label}: ${describeWrite(r)} ${JSON.stringify(r.data)?.slice(0, 160) ?? ''}  <-- inconcluso`);
      counters.fail++;
    }
  }
}

async function main() {
  console.log('=== RLS Anon Leaks Test ===');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log();

  const counters = { pass: 0, fail: 0 };

  for (const t of TABLES_TO_PROBE) {
    const r = await probeTable(t);
    const isLeak = r.ok && typeof r.rowsReturned === 'number' && r.rowsReturned > 0;
    const symbol = isLeak ? 'X LEAK' : 'OK';
    console.log(
      `  ${symbol} ${t}: HTTP ${r.status}, rows=${r.rowsReturned}${isLeak ? '  <-- VULNERABILITY' : ''}`,
    );
    if (isLeak) {
      counters.fail++;
      console.log(`    Sample row: ${JSON.stringify(r.data?.[0])?.slice(0, 200)}...`);
    } else {
      counters.pass++;
    }
  }

  console.log();
  console.log('=== RPC Functions Denied to Anon ===');
  for (const fn of RPC_FUNCTIONS_DENIED) {
    const r = await probeRpc(fn);
    const denied = r.status === 401 || r.status === 403 || r.status === 404;
    const symbol = denied ? 'OK' : 'X CALLABLE';
    console.log(`  ${symbol} rpc/${fn}: HTTP ${r.status}${denied ? '' : '  <-- ANON CAN CALL'}`);
    if (denied) counters.pass++;
    else counters.fail++;
  }

  console.log();
  console.log('=== Authenticated Write Probes (migrations 086 + 088) ===');
  const jwt = await obtainUserJwt();
  if (!jwt) {
    console.log('  - SKIP: sin RLS_TEST_USER_JWT ni RLS_TEST_USER_EMAIL/PASSWORD. Ver README.md para la prueba a mano con curl.');
  } else {
    await runAuthenticatedWriteProbes(jwt, counters);
  }

  console.log();
  console.log(`Result: ${counters.pass} pass, ${counters.fail} fail`);
  process.exit(counters.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
