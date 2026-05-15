#!/usr/bin/env node
/**
 * test-dev-login-blocked.mjs (Hardening 2026-05-15)
 *
 * Valida que `/api/dev-login` está bloqueado fuera de dev local.
 * Cuando se ejecuta contra una preview/staging URL, DEBE devolver 404.
 * Contra localhost con ENABLE_DEV_LOGIN=1 debería funcionar.
 *
 * Uso:
 *   PANEL_BASE_URL=https://panel-staging.fyzon.es \
 *     node apps/motor-agente/test/security/test-dev-login-blocked.mjs
 *   PANEL_BASE_URL=http://localhost:3000 \
 *     node apps/motor-agente/test/security/test-dev-login-blocked.mjs
 */

const PANEL_BASE_URL = process.env.PANEL_BASE_URL ?? 'http://localhost:3000';

async function probe(query) {
  const res = await fetch(`${PANEL_BASE_URL}/api/dev-login${query}`, {
    method: 'GET',
    redirect: 'manual',
  });
  return { status: res.status };
}

async function main() {
  console.log('=== Dev-Login Blocked Test ===');
  console.log(`Target: ${PANEL_BASE_URL}/api/dev-login`);
  console.log();

  const r1 = await probe('?email=sotobautistaivan@gmail.com');
  const r2 = await probe('?email=attacker@evil.com');
  const r3 = await probe('?email=admin@anywhere.com&next=//evil.com');

  const isLocalhost = PANEL_BASE_URL.includes('localhost') || PANEL_BASE_URL.includes('127.0.0.1');

  console.log(`  whitelisted email: HTTP ${r1.status} ${isLocalhost ? '(esperado 302/200 si dev OK)' : '(esperado 404)'}`);
  console.log(`  non-whitelisted email: HTTP ${r2.status} ${isLocalhost ? '(esperado 403)' : '(esperado 404)'}`);
  console.log(`  open redirect attempt: HTTP ${r3.status} ${isLocalhost ? '(esperado 400 o 403)' : '(esperado 404)'}`);

  if (!isLocalhost) {
    // Fuera de dev, los 3 deben ser 404.
    const allBlocked = r1.status === 404 && r2.status === 404 && r3.status === 404;
    console.log();
    console.log(allBlocked ? 'PASS: dev-login bloqueado fuera de localhost' : 'X FAIL: dev-login accesible fuera de dev');
    process.exit(allBlocked ? 0 : 1);
  } else {
    console.log();
    console.log('LOCALHOST mode: revisa que el comportamiento sea correcto manualmente.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
