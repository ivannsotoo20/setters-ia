#!/usr/bin/env node
/**
 * Verifica si la CREDENTIALS_ENCRYPTION_KEY local descifra credenciales
 * encriptadas de producción (almacenadas en BD via service_role).
 *
 * Útil para responder: ¿dev y prod usan la misma key?
 *
 * Uso:
 *   node apps/motor-agente/scripts/verify-encryption-key.mjs --tenant 3
 *
 * Si descifra: dev y prod comparten key. El backup que ya hiciste sirve para ambas.
 * Si falla con auth tag mismatch: keys distintas. Necesitas backup separado del VPS.
 */

import { createClient } from '@supabase/supabase-js';
import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(__dirname, '../../../.env.local'),
  resolve(__dirname, '../.env.local'),
  resolve(process.cwd(), '.env.local'),
];
for (const envPath of envCandidates) {
  try {
    const txt = readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    console.log(`-> Loaded env from ${envPath}`);
    break;
  } catch {
    /* try next */
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY_HEX = process.env.CREDENTIALS_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !KEY_HEX) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CREDENTIALS_ENCRYPTION_KEY');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(KEY_HEX)) {
  console.error('CREDENTIALS_ENCRYPTION_KEY format wrong: expected 64 hex chars');
  process.exit(1);
}

const tenantId = Number(process.argv[process.argv.indexOf('--tenant') + 1]) || 3;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Carga una row de integration_accounts con credentials_encrypted del tenant
const { data, error } = await sb
  .from('integration_accounts')
  .select('id, tenant_id, provider, credentials_encrypted')
  .eq('tenant_id', tenantId)
  .eq('is_active', true)
  .not('credentials_encrypted', 'is', null)
  .limit(1)
  .maybeSingle();

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}
if (!data) {
  console.error(`No hay integration_accounts cifrados para tenant ${tenantId}`);
  process.exit(1);
}

// El blob viene como JSONB {"blob":"v1:iv:ct:tag"}
const blobObj = data.credentials_encrypted;
const blob = typeof blobObj === 'string' ? blobObj : blobObj?.blob;
if (!blob || typeof blob !== 'string') {
  console.error('integration_accounts.credentials_encrypted shape inesperado:', blobObj);
  process.exit(1);
}

const parts = blob.split(':');
if (parts.length !== 4) {
  console.error('Blob malformado, esperaba 4 partes (v:iv:ct:tag) y vinieron', parts.length);
  process.exit(1);
}
const [version, ivB64, ctB64, tagB64] = parts;
if (version !== 'v1') {
  console.error('Versión de cifrado inesperada:', version);
  process.exit(1);
}

const key = Buffer.from(KEY_HEX, 'hex');
const iv = Buffer.from(ivB64, 'base64');
const ct = Buffer.from(ctB64, 'base64');
const tag = Buffer.from(tagB64, 'base64');

console.log('');
console.log('==================== Verify Encryption Key ====================');
console.log(`Tenant: ${data.tenant_id}, provider: ${data.provider}`);
console.log(`Key prefix: ${KEY_HEX.slice(0, 8)}... suffix: ...${KEY_HEX.slice(-8)}`);
console.log('Intentando descifrar credentials_encrypted con la key local...');

try {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  // No imprimimos el plaintext (contiene secretos). Solo el shape.
  let parsed;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    parsed = '<no JSON parseable>';
  }
  console.log('');
  console.log('✓ DESCIFRADO OK — la key LOCAL descifra credentials de PROD.');
  console.log('  Conclusión: dev y prod usan la MISMA encryption key.');
  console.log('  Backup que acabas de hacer cubre ambos entornos.');
  console.log('  Recomendación (no urgente): rotar key prod en sprint futuro');
  console.log('  para separar dev/prod por defense-in-depth.');
  console.log('');
  console.log('Shape del plaintext descifrado (solo keys, sin valores):',
    typeof parsed === 'object' && parsed ? Object.keys(parsed) : parsed);
  console.log('===============================================================');
} catch (err) {
  console.log('');
  console.log('✗ DECRYPT FAILED — la key LOCAL no descifra credentials de PROD.');
  console.log(`  Error: ${err.message}`);
  console.log('  Conclusión: dev y prod usan keys DISTINTAS.');
  console.log('  Necesitas entrar al VPS Contabo para hacer backup de la key prod.');
  console.log('===============================================================');
  process.exit(2);
}
