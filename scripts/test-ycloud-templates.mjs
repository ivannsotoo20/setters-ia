#!/usr/bin/env node
/**
 * Hito 9 — debugging tool para sync YCloud templates.
 *
 * Descifra la apiKey del integration_account ycloud activo del tenant pasado
 * por arg, llama YCloud /v2/whatsapp/templates?wabaId=<X> y imprime status +
 * body completo. Sirve para diagnosticar errores que el toast del panel
 * agrega ("1 errores") sin mostrar el mensaje real.
 *
 * Uso (desde raíz del repo):
 *   node scripts/test-ycloud-templates.mjs <tenant_id>
 *
 * Requiere .env.local con:
 *   - SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - CREDENTIALS_ENCRYPTION_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Carga .env.local manual (sin dotenv para no depender de install)
const envPath = resolve(root, '.env.local');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (m) {
      let val = m[2];
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
}

const tenantId = Number(process.argv[2] ?? 3);
if (!Number.isFinite(tenantId) || tenantId <= 0) {
  console.error('Uso: node scripts/test-ycloud-templates.mjs <tenant_id>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENC_KEY_HEX = process.env.CREDENTIALS_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
if (!ENC_KEY_HEX) {
  console.error('Falta CREDENTIALS_ENCRYPTION_KEY en .env.local (hex de 64 chars)');
  process.exit(1);
}

function decrypt(blob) {
  // Format real (apps/motor-agente/src/lib/crypto.ts): v1:<iv_b64>:<ct_b64>:<tag_b64>
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error(`blob inválido: ${parts[0]}`);
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const key = Buffer.from(ENC_KEY_HEX, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: ia, error } = await supabase
  .from('integration_accounts')
  .select('id, provider, credentials, credentials_encrypted, connection_config')
  .eq('tenant_id', tenantId)
  .eq('provider', 'ycloud')
  .eq('is_active', true)
  .order('id', { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error('SQL error:', error.message);
  process.exit(1);
}
if (!ia) {
  console.error(`No hay integration_account ycloud activa para tenant ${tenantId}`);
  process.exit(1);
}

console.log('integration_account id =', ia.id);
console.log('connection_config =', JSON.stringify(ia.connection_config, null, 2));

let apiKey;
if (ia.credentials_encrypted?.blob) {
  const plain = decrypt(ia.credentials_encrypted.blob);
  const obj = JSON.parse(plain);
  apiKey = obj.apiKey ?? obj.api_key;
  console.log('credentials descifradas: keys =', Object.keys(obj).join(','));
} else if (ia.credentials?.apiKey) {
  apiKey = ia.credentials.apiKey;
  console.log('credentials sin cifrar (legacy)');
} else if (ia.credentials?.api_key) {
  apiKey = ia.credentials.api_key;
  console.log('credentials sin cifrar (legacy, snake_case)');
}

if (!apiKey) {
  console.error('No hay apiKey en credentials');
  process.exit(1);
}
console.log('apiKey:', apiKey.slice(0, 8) + '…' + apiKey.slice(-4));

const wabaId = ia.connection_config?.wabaId ?? ia.connection_config?.waba_id;
if (!wabaId) {
  console.error('No hay wabaId en connection_config');
  process.exit(1);
}
console.log('wabaId:', wabaId);

console.log('\n--- TEST 1: GET /v2/whatsapp/businessAccounts ---');
{
  const res = await fetch('https://api.ycloud.com/v2/whatsapp/businessAccounts', {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });
  console.log('status:', res.status);
  const body = await res.text();
  console.log('body:', body.slice(0, 600));
}

console.log('\n--- TEST 2: GET /v2/whatsapp/templates?wabaId=' + wabaId + '&limit=100 ---');
{
  const url = `https://api.ycloud.com/v2/whatsapp/templates?wabaId=${encodeURIComponent(wabaId)}&limit=100`;
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });
  console.log('status:', res.status);
  const body = await res.text();
  console.log('body:', body.slice(0, 1500));
}

console.log('\n--- TEST 3: GET /v2/whatsapp/templates (sin wabaId) ---');
{
  const res = await fetch('https://api.ycloud.com/v2/whatsapp/templates?limit=100', {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });
  console.log('status:', res.status);
  const body = await res.text();
  console.log('body:', body.slice(0, 1500));
}
