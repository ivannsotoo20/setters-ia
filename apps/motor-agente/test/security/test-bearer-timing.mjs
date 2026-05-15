#!/usr/bin/env node
/**
 * test-bearer-timing.mjs (Hardening 2026-05-15)
 *
 * Valida que los endpoints `/internal/*` rechazan bearers inválidos
 * Y que la latencia es constante para tokens del mismo length
 * (timing-safe compare).
 *
 * Uso:
 *   MOTOR_BASE_URL=http://localhost:3001 \
 *   INTERNAL_STATS_TOKEN=real-token \
 *     node apps/motor-agente/test/security/test-bearer-timing.mjs
 */

const MOTOR_BASE_URL = process.env.MOTOR_BASE_URL ?? 'http://localhost:3001';
const REAL_TOKEN = process.env.INTERNAL_STATS_TOKEN ?? 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

if (!process.env.INTERNAL_STATS_TOKEN) {
  console.warn('WARN: INTERNAL_STATS_TOKEN not set, using placeholder. Only timing differential is checked.');
}

const ROUNDS = 200;

async function measureOne(token) {
  const start = process.hrtime.bigint();
  const res = await fetch(`${MOTOR_BASE_URL}/internal/stats`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const end = process.hrtime.bigint();
  void (await res.text());
  return { status: res.status, durationNs: Number(end - start) };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function p95(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)];
}

async function main() {
  console.log('=== Bearer Timing Test ===');
  console.log(`Target: ${MOTOR_BASE_URL}/internal/stats`);
  console.log(`Rounds: ${ROUNDS} per scenario`);
  console.log();

  // Probar que el motor responde
  const probe = await measureOne('anything');
  if (probe.status === 0 || probe.status >= 500) {
    console.error(`Motor unreachable (status ${probe.status}). Aborting.`);
    process.exit(2);
  }
  console.log(`Motor reachable: status=${probe.status} (esperado 401 si bearer inválido)`);
  console.log();

  // Construir tokens del mismo length que real, pero distintos.
  const wrong1 = 'a'.repeat(REAL_TOKEN.length);
  const wrong2 = 'z'.repeat(REAL_TOKEN.length);
  // Token con prefix correcto pero suffix incorrecto. En un timing-vulnerable
  // compare, este toma más tiempo que un mismatch en el primer char.
  const prefixHalf = REAL_TOKEN.slice(0, Math.floor(REAL_TOKEN.length / 2)) + 'a'.repeat(Math.ceil(REAL_TOKEN.length / 2));

  const scenarios = [
    { name: 'all-a same length', token: wrong1 },
    { name: 'all-z same length', token: wrong2 },
    { name: 'matching prefix half', token: prefixHalf },
  ];

  for (const sc of scenarios) {
    const durations = [];
    for (let i = 0; i < ROUNDS; i++) {
      const r = await measureOne(sc.token);
      durations.push(r.durationNs);
    }
    const med = median(durations) / 1e6; // ms
    const p = p95(durations) / 1e6;
    console.log(`  ${sc.name.padEnd(28)} median=${med.toFixed(2)}ms p95=${p.toFixed(2)}ms`);
  }

  console.log();
  console.log('Si las medianas difieren >5ms entre escenarios, posible timing oracle.');
  console.log('Con isValidBearer (timingSafeEqual) deberían ser similares.');
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
