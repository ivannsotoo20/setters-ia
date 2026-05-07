#!/usr/bin/env node
// ============================================================================
// encrypt-credentials.mjs — Hardening 1.1 backfill (one-shot, idempotente)
// ============================================================================
// Lee `integration_accounts` y encripta `credentials` plain → `credentials_encrypted`
// como blob AES-256-GCM con prefix `v1:`.
//
// Idempotente: salta los registros que ya tengan `credentials_encrypted IS NOT NULL`.
//
// Pre-requisitos:
//   - schema/v1/migrations/006-encrypt-credentials-columns.sql aplicada.
//   - CREDENTIALS_ENCRYPTION_KEY en .env.local (32 bytes hex).
//   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
//
// Uso:
//   node scripts/encrypt-credentials.mjs               # ejecuta backfill
//   node scripts/encrypt-credentials.mjs --dry-run     # solo cuenta y muestra
// ============================================================================

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';

// ----------------------------------------------------------------------------
// Carga .env.local (con override) — busca en la raíz del repo
// ----------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const envCandidates = [resolve(here, '../.env.local'), resolve(process.cwd(), '.env.local')];
for (const path of envCandidates) {
  if (existsSync(path)) {
    loadEnv({ path, override: true });
    break;
  }
}

// ----------------------------------------------------------------------------
// Validación de env
// ----------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY_HEX = process.env.CREDENTIALS_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausentes en .env.local');
  process.exit(1);
}
if (!KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(KEY_HEX)) {
  console.error('ERROR: CREDENTIALS_ENCRYPTION_KEY ausente o malformada (esperado 32 bytes hex / 64 chars)');
  console.error('Genera una con: openssl rand -hex 32');
  process.exit(1);
}
const KEY = Buffer.from(KEY_HEX, 'hex');
const DRY_RUN = process.argv.includes('--dry-run');

// ----------------------------------------------------------------------------
// Crypto (replicado de apps/motor-agente/src/lib/crypto.ts; mantener en sync)
// ----------------------------------------------------------------------------
function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[encrypt-credentials] mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);

  // 1) Contar pendientes
  const { count: pendingCount, error: countErr } = await supabase
    .from('integration_accounts')
    .select('id', { count: 'exact', head: true })
    .not('credentials', 'is', null)
    .is('credentials_encrypted', null);

  if (countErr) {
    console.error('ERROR contando pendientes:', countErr);
    process.exit(1);
  }

  console.log(`[encrypt-credentials] pendientes: ${pendingCount ?? 0}`);

  if ((pendingCount ?? 0) === 0) {
    console.log('[encrypt-credentials] nada que hacer (idempotente).');
    process.exit(0);
  }

  // 2) Cargar registros pendientes (id + credentials)
  const { data: rows, error: selErr } = await supabase
    .from('integration_accounts')
    .select('id, tenant_id, provider, credentials')
    .not('credentials', 'is', null)
    .is('credentials_encrypted', null)
    .order('id', { ascending: true });

  if (selErr) {
    console.error('ERROR cargando registros:', selErr);
    process.exit(1);
  }

  console.log(`[encrypt-credentials] cargados ${rows.length} registros`);

  if (DRY_RUN) {
    for (const r of rows) {
      const keys = Object.keys(r.credentials ?? {}).sort().join(',');
      console.log(`  - id=${r.id} tenant=${r.tenant_id} provider=${r.provider} keys=[${keys}]`);
    }
    console.log('[encrypt-credentials] DRY-RUN done. No writes performed.');
    process.exit(0);
  }

  // 3) Encriptar y UPDATE uno a uno (volúmen pequeño, no necesitamos batch)
  let okCount = 0;
  let errCount = 0;
  for (const r of rows) {
    try {
      const plaintext = JSON.stringify(r.credentials);
      const blob = encrypt(plaintext, KEY);
      const { error: updErr } = await supabase
        .from('integration_accounts')
        .update({ credentials_encrypted: { blob } })
        .eq('id', r.id);
      if (updErr) {
        console.error(`  - id=${r.id} UPDATE ERROR:`, updErr.message);
        errCount += 1;
      } else {
        okCount += 1;
        console.log(`  ✓ id=${r.id} tenant=${r.tenant_id} provider=${r.provider} blob_chars=${blob.length}`);
      }
    } catch (err) {
      console.error(`  - id=${r.id} encrypt ERROR:`, err.message);
      errCount += 1;
    }
  }

  console.log(`[encrypt-credentials] done. ok=${okCount} err=${errCount}`);

  // 4) Verificación post: 0 pendientes (a menos que hubiera errores)
  const { count: postCount } = await supabase
    .from('integration_accounts')
    .select('id', { count: 'exact', head: true })
    .not('credentials', 'is', null)
    .is('credentials_encrypted', null);

  console.log(`[encrypt-credentials] pendientes restantes: ${postCount ?? 0}`);

  if (errCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
