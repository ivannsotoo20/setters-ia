import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { decryptWithDefault } from './crypto.js';
import { logger } from './logger.js';

let client: Anthropic | null = null;

/**
 * Cliente Anthropic de la PLATAFORMA (la clave de Fyzon).
 *
 * Se usa para los tenants que no han traído la suya, y para todo lo que no
 * pertenece a ningún tenant.
 */
export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Clientes por tenant, cacheados junto a la huella de la clave con la que se
 * construyeron. Sin la huella, cambiar la clave desde el panel no tendría efecto
 * hasta reiniciar el motor: seguiríamos sirviendo el cliente viejo.
 */
const tenantClients = new Map<number, { client: Anthropic; fingerprint: string }>();

/** Huella barata para detectar que la clave cambió. No identifica la clave. */
function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

/**
 * Devuelve el cliente Anthropic que le toca a este tenant.
 *
 * Si el entrenador trajo su clave (`tenant_configs.anthropic_api_key_encrypted`),
 * el consumo va a SU cuenta. Si no, cae a la de la plataforma.
 *
 * Por qué existe: hasta el 2026-08-24 había un único cliente global. Ese día se
 * agotó el saldo de la plataforma y se quedaron sin setter TODOS los
 * entrenadores a la vez. Con clave propia, quedarse sin crédito solo afecta a
 * quien lo gastó.
 *
 * Nunca lanza por culpa de la clave del tenant: si está corrupta o no se puede
 * descifrar, se registra y se sigue con la de la plataforma. Dejar a un
 * entrenador sin setter por un fallo al descifrar sería peor que la factura.
 */
export async function getAnthropicForTenant(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<Anthropic> {
  const apiKey = await loadTenantApiKey(supabase, tenantId);
  if (!apiKey) return getAnthropic();

  const fp = fingerprint(apiKey);
  const cached = tenantClients.get(tenantId);
  if (cached && cached.fingerprint === fp) return cached.client;

  const fresh = new Anthropic({ apiKey });
  tenantClients.set(tenantId, { client: fresh, fingerprint: fp });
  return fresh;
}

/** Devuelve la clave descifrada del tenant, o null si no tiene / no se puede leer. */
async function loadTenantApiKey(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('anthropic_api_key_encrypted')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return null;

  const raw = (data as { anthropic_api_key_encrypted?: unknown })
    .anthropic_api_key_encrypted;
  if (!raw || typeof raw !== 'object') return null;

  const blob = (raw as { blob?: unknown }).blob;
  if (typeof blob !== 'string' || blob.length === 0) return null;

  try {
    const plain = decryptWithDefault(blob).trim();
    // El panel cifra con `encryptJson`, que serializa antes: la clave llega
    // entrecomillada. El motor podria cifrarla en plano. Se aceptan las dos
    // formas para que no dependa de quien la escribio.
    let key = plain;
    if (plain.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(plain);
        if (typeof parsed === 'string') key = parsed.trim();
      } catch {
        // No era JSON: se queda el texto tal cual.
      }
    }
    return key.length > 0 ? key : null;
  } catch (err) {
    logger.error(
      { tenantId, err: err instanceof Error ? err.message : String(err) },
      'getAnthropicForTenant: no se pudo descifrar la clave del tenant; se usa la de la plataforma',
    );
    return null;
  }
}

/** Solo para tests: vacía la caché de clientes por tenant. */
export function __clearTenantAnthropicCache(): void {
  tenantClients.clear();
}
