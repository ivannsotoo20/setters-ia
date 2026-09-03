#!/usr/bin/env node
/**
 * test-rls-anon-leaks.mjs (Hardening 2026-05-15)
 *
 * Valida empíricamente que las tablas con RLS no devuelven datos al rol anon.
 * Si alguna devuelve filas, RLS está roto y hay leak crítico cross-tenant.
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *     node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
 *
 * Exit code 0 si todos los controles pasan, 1 si hay leaks.
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

async function main() {
  console.log('=== RLS Anon Leaks Test ===');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log();

  let pass = 0;
  let fail = 0;

  for (const t of TABLES_TO_PROBE) {
    const r = await probeTable(t);
    const isLeak = r.ok && typeof r.rowsReturned === 'number' && r.rowsReturned > 0;
    const symbol = isLeak ? 'X LEAK' : 'OK';
    console.log(
      `  ${symbol} ${t}: HTTP ${r.status}, rows=${r.rowsReturned}${isLeak ? '  <-- VULNERABILITY' : ''}`,
    );
    if (isLeak) {
      fail++;
      console.log(`    Sample row: ${JSON.stringify(r.data?.[0])?.slice(0, 200)}...`);
    } else {
      pass++;
    }
  }

  console.log();
  console.log('=== RPC Functions Denied to Anon ===');
  for (const fn of RPC_FUNCTIONS_DENIED) {
    const r = await probeRpc(fn);
    const denied = r.status === 401 || r.status === 403 || r.status === 404;
    const symbol = denied ? 'OK' : 'X CALLABLE';
    console.log(`  ${symbol} rpc/${fn}: HTTP ${r.status}${denied ? '' : '  <-- ANON CAN CALL'}`);
    if (denied) pass++;
    else fail++;
  }

  console.log();
  console.log(`Result: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
