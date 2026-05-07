import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptWithDefault, CryptoError } from './crypto.js';

/**
 * Helper que carga las credenciales de un `integration_accounts` aplicando
 * encriptación at-rest (Hardening 1.1) con fallback transparente a la columna
 * `credentials` plain mientras dura la transición.
 *
 * Estrategia:
 *   1. Lee `credentials_encrypted` y `credentials` del registro.
 *   2. Si `credentials_encrypted` existe → descifra el blob con `decryptWithDefault`
 *      → JSON.parse → devuelve. Requiere `CREDENTIALS_ENCRYPTION_KEY`.
 *   3. Si solo `credentials` plain → devuelve directamente (back-compat).
 *   4. Si ninguno → throw.
 *
 * Tras ejecutar `scripts/encrypt-credentials.mjs`, todos los registros tendrán
 * `credentials_encrypted` y este helper preferirá esa columna automáticamente.
 * Cuando se elimine la columna `credentials`, este helper seguirá funcionando.
 */

interface EncryptedBlobShape {
  blob?: unknown;
}

export class IntegrationCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationCredentialsError';
  }
}

export async function getIntegrationCredentials(
  supabase: SupabaseClient,
  integrationAccountId: number,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted')
    .eq('id', integrationAccountId)
    .maybeSingle();

  if (error) {
    throw new IntegrationCredentialsError(
      `failed to load integration_account ${integrationAccountId}: ${error.message}`,
    );
  }
  if (!data) {
    throw new IntegrationCredentialsError(
      `integration_account ${integrationAccountId} not found`,
    );
  }

  return decodeCredentialsRow(data, integrationAccountId);
}

export interface CredentialsRow {
  credentials?: unknown;
  credentials_encrypted?: unknown;
}

/**
 * Versión pura: dado un row ya cargado (con `credentials` y/o `credentials_encrypted`),
 * devuelve el objeto plano. Útil cuando un caller ya está leyendo otras columnas
 * del mismo registro y no quiere hacer una segunda query.
 */
export function decodeCredentialsRow(
  row: CredentialsRow,
  integrationAccountId: number,
): Record<string, unknown> {
  const encrypted = row.credentials_encrypted;
  if (encrypted && typeof encrypted === 'object') {
    const blob = (encrypted as EncryptedBlobShape).blob;
    if (typeof blob === 'string' && blob.length > 0) {
      return decryptBlobToObject(blob, integrationAccountId);
    }
  }
  const plain = row.credentials;
  if (plain && typeof plain === 'object') {
    return plain as Record<string, unknown>;
  }
  throw new IntegrationCredentialsError(
    `integration_account ${integrationAccountId} has neither credentials_encrypted nor credentials populated`,
  );
}

function decryptBlobToObject(blob: string, integrationAccountId: number): Record<string, unknown> {
  let plaintext: string;
  try {
    plaintext = decryptWithDefault(blob);
  } catch (err) {
    if (err instanceof CryptoError) {
      throw new IntegrationCredentialsError(
        `failed to decrypt credentials for integration_account ${integrationAccountId}: ${err.message}`,
      );
    }
    throw err;
  }
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new IntegrationCredentialsError(
        `decrypted credentials for integration_account ${integrationAccountId} is not a JSON object`,
      );
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof IntegrationCredentialsError) throw err;
    throw new IntegrationCredentialsError(
      `decrypted credentials for integration_account ${integrationAccountId} is not valid JSON: ${(err as Error).message}`,
    );
  }
}
