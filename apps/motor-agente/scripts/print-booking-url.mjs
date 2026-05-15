#!/usr/bin/env node
/**
 * Print booking URL trackeable (smoke E2E Hito 10).
 *
 * Toma un leadId o phone, busca el calendar default del tenant, computa
 * tracking_uuid (HMAC-SHA256 con CREDENTIALS_ENCRYPTION_KEY como string),
 * persiste en `leads.tracking_uuid` si no estaba, y imprime la URL list-to-use.
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente exec node scripts/print-booking-url.mjs --lead 6
 *   pnpm --filter @fyzon/motor-agente exec node scripts/print-booking-url.mjs --tenant 3 --phone +34639541043
 *
 * Carga .env.local del motor automáticamente.
 */

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Load .env.local from apps/motor-agente
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
try {
  const txt = readFileSync(envPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.error(`WARN: no se pudo cargar ${envPath} — asumiendo env vars ya seteadas`);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error('Missing one of: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CREDENTIALS_ENCRYPTION_KEY');
  process.exit(1);
}

// ---- Parse args
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--') && i + 1 < process.argv.length) {
    args[a.slice(2)] = process.argv[++i];
  }
}
const leadId = args.lead ? Number(args.lead) : null;
const phone = args.phone || null;
const tenantId = args.tenant ? Number(args.tenant) : 3;
if (!leadId && !phone) {
  console.error('Pasa --lead <id> o --phone <+E164> (con --tenant <id> opcional, default 3)');
  process.exit(1);
}

// ---- Algorithm: idéntico a apps/motor-agente/src/lib/tracking-uuid.ts (string secret, no hex)
function computeTrackingUuid(leadIdInput) {
  return createHmac('sha256', ENCRYPTION_KEY)
    .update(String(leadIdInput))
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 16);
}

// ---- Main
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) Lead
let lead = null;
if (leadId) {
  const { data, error } = await sb
    .from('leads')
    .select('id, first_name, phone, tracking_uuid, tenant_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  lead = data;
} else if (phone) {
  const { data, error } = await sb
    .from('leads')
    .select('id, first_name, phone, tracking_uuid, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  lead = data;
}
if (!lead) {
  console.error(`Lead no encontrado (lead=${leadId}, phone=${phone}, tenant=${tenantId})`);
  process.exit(1);
}

// 2) Calendar default del tenant del lead
const { data: cal, error: calErr } = await sb
  .from('calendar_accounts')
  .select('id, name, widget_base_url')
  .eq('tenant_id', lead.tenant_id)
  .eq('is_default', true)
  .eq('is_active', true)
  .maybeSingle();
if (calErr) throw calErr;
if (!cal) {
  console.error(`No hay calendar default activo para tenant ${lead.tenant_id}`);
  process.exit(1);
}

// 3) Compute tracking_uuid (determinístico desde leadId)
const uuid = computeTrackingUuid(lead.id);

// 4) Persist if not already (lazy generation, idéntico a getTrackedCalendarUrl)
if (!lead.tracking_uuid) {
  const { error: updErr } = await sb
    .from('leads')
    .update({ tracking_uuid: uuid })
    .eq('id', lead.id)
    .is('tracking_uuid', null);
  if (updErr) {
    console.error(`WARN: no se pudo persistir tracking_uuid: ${updErr.message}`);
  } else {
    console.log(`-> Persisted leads.tracking_uuid = ${uuid} for lead ${lead.id}`);
  }
} else if (lead.tracking_uuid !== uuid) {
  console.error(`MISMATCH: lead ya tiene tracking_uuid=${lead.tracking_uuid} pero HMAC produjo ${uuid}.`);
  console.error('Esto indica que CREDENTIALS_ENCRYPTION_KEY rotó. Usa el de BD:');
  console.log(`URL con BD uuid: ${cal.widget_base_url}?fyzon_lead_uuid=${lead.tracking_uuid}`);
  process.exit(2);
} else {
  console.log(`-> leads.tracking_uuid ya existe y coincide con HMAC (OK)`);
}

// 5) Build URL
const url = new URL(cal.widget_base_url);
url.searchParams.set('fyzon_lead_uuid', uuid);

console.log('');
console.log('==================== Smoke E2E Booking URL ====================');
console.log(`Lead         : id=${lead.id} name=${lead.first_name ?? '<null>'} phone=${lead.phone}`);
console.log(`Tenant       : ${lead.tenant_id}`);
console.log(`Calendar     : ${cal.name}`);
console.log(`Tracking UUID: ${uuid}`);
console.log('');
console.log('URL trackeable (abrir en navegador, reservar cita):');
console.log(url.toString());
console.log('===============================================================');
