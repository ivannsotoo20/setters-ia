#!/usr/bin/env tsx
/**
 * Diagnóstico Sprint Iota.5 PR-B — verifica endpoints críticos GHL contra un
 * tenant. Útil para smoke Bloque F (gate cliente Pablo).
 *
 * Uso desde la raíz del monorepo:
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/diag-ghl-pit.ts --tenant-id 2
 *
 * Output: 6 endpoints chequeados con OK/FAIL + breve descripción.
 * Útil para detectar scope insuficiente del PIT (o token revocado / inválido).
 */

import { getSupabase } from '../src/lib/supabase.js';
import { resolveGhlCredentials } from '../src/lib/resolve-ghl-credentials.js';
import { logger } from '../src/lib/logger.js';

interface EndpointCheck {
  name: string;
  description: string;
  path: string;
  scope: string;
  critical: 'YES' | 'NO';
}

const ENDPOINTS: EndpointCheck[] = [
  {
    name: 'locations/{id}',
    description: 'Auth básico + valida locationId',
    path: '/locations/{LOCATION_ID}',
    scope: 'locations.readonly',
    critical: 'YES',
  },
  {
    name: 'calendars/',
    description: 'List calendars (sync calendars panel)',
    path: '/calendars/?locationId={LOCATION_ID}',
    scope: 'calendars.readonly',
    critical: 'YES',
  },
  {
    name: 'locations/{id}/customFields',
    description: 'ensureCustomField fyzon_lead_uuid (Hito 10)',
    path: '/locations/{LOCATION_ID}/customFields',
    scope: 'locations.readonly',
    critical: 'YES',
  },
  {
    name: 'contacts/search',
    description: 'Lookup leads (matcher de appointments)',
    path: '/contacts/?locationId={LOCATION_ID}&limit=1',
    scope: 'contacts.readonly',
    critical: 'YES',
  },
  {
    name: 'opportunities/search',
    description: 'Opportunities sync (futuro Iota.7)',
    path: '/opportunities/search?location_id={LOCATION_ID}&limit=1',
    scope: 'opportunities.readonly',
    critical: 'NO',
  },
  {
    name: 'conversations/search',
    description: 'Mirror conversaciones (futuro)',
    path: '/conversations/search?locationId={LOCATION_ID}&limit=1',
    scope: 'conversations.readonly',
    critical: 'NO',
  },
];

const GHL_BASE = 'https://services.leadconnectorhq.com';

function parseArgs(): { tenantId: number } {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--tenant-id');
  if (idx === -1 || !argv[idx + 1]) {
    console.error('Uso: tsx scripts/diag-ghl-pit.ts --tenant-id <N>');
    process.exit(2);
  }
  const tid = Number(argv[idx + 1]);
  if (!Number.isFinite(tid) || tid < 1) {
    console.error('--tenant-id debe ser un entero positivo');
    process.exit(2);
  }
  return { tenantId: tid };
}

async function checkEndpoint(
  endpoint: EndpointCheck,
  accessToken: string,
  locationId: string,
): Promise<{ ok: boolean; status: number; snippet: string }> {
  const path = endpoint.path.replace('{LOCATION_ID}', locationId);
  const url = `${GHL_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;
    return { ok: res.ok, status: res.status, snippet };
  } catch (err) {
    return { ok: false, status: 0, snippet: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const { tenantId } = parseArgs();
  console.log(`\n=== Diag GHL PIT — tenant_id=${tenantId} — ${new Date().toISOString()} ===\n`);

  const supabase = getSupabase();
  const cred = await resolveGhlCredentials(supabase, tenantId, {
    warn: (o, msg) => logger.warn(o, msg),
    info: (o, msg) => logger.info(o, msg),
  });
  if (!cred.ok) {
    console.error(`❌ resolveGhlCredentials FAIL — ${cred.error}: ${cred.message}`);
    process.exit(1);
  }

  console.log(`Credentials resolved:`);
  console.log(`  credSource: ${cred.credSource}`);
  console.log(`  locationId: ${cred.locationId}`);
  console.log(`  accessToken: ${cred.accessToken.slice(0, 8)}…${cred.accessToken.slice(-4)}`);
  console.log();

  let okCount = 0;
  let critFailCount = 0;
  for (const ep of ENDPOINTS) {
    process.stdout.write(`[${ep.critical === 'YES' ? '!' : ' '}] ${ep.name.padEnd(35)} `);
    const r = await checkEndpoint(ep, cred.accessToken, cred.locationId);
    if (r.ok) {
      console.log(`✅ ${r.status}  (scope: ${ep.scope})`);
      okCount++;
    } else {
      console.log(`❌ ${r.status}  (scope: ${ep.scope})`);
      console.log(`     ${ep.description}`);
      console.log(`     ${r.snippet.replace(/\n/g, ' ')}`);
      if (ep.critical === 'YES') critFailCount++;
    }
  }

  console.log(`\n=== Resultado: ${okCount}/${ENDPOINTS.length} endpoints OK ===`);
  if (critFailCount > 0) {
    console.log(`❌ ${critFailCount} endpoint(s) crítico(s) fallaron. PIT necesita más scopes.`);
    console.log(`   Settings → Private Integrations → tu PIT → Edit scopes en GHL panel.`);
    process.exit(1);
  }
  console.log(`✅ Todos los endpoints críticos OK. PIT listo para producción.`);
}

main().catch((err) => {
  console.error('diag-ghl-pit error:', err);
  process.exit(1);
});
