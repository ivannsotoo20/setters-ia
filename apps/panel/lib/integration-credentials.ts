import { decryptJson, PanelCryptoError } from './crypto';

/**
 * Decodifica `integration_accounts` credentials desde el row de Supabase.
 *
 * - Prefiere `credentials_encrypted` (shape `{ blob: '<v1:iv:ct:tag>' }`).
 * - Fallback a `credentials` plain (back-compat hasta que se complete migración).
 *
 * Replica la lógica de `apps/motor-agente/src/lib/integration-credentials.ts`
 * pero usando el `decryptJson` del panel (que es server-only y compatible con
 * el formato del motor).
 */
export class IntegrationCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationCredentialsError';
  }
}

interface EncryptedShape {
  blob?: unknown;
}

export interface CredentialsRow {
  credentials?: unknown;
  credentials_encrypted?: unknown;
}

export function decodeCredentialsRow(
  row: CredentialsRow,
  integrationAccountId: number,
): Record<string, unknown> {
  const encrypted = row.credentials_encrypted;
  if (encrypted && typeof encrypted === 'object') {
    const blob = (encrypted as EncryptedShape).blob;
    if (typeof blob === 'string' && blob.length > 0) {
      try {
        const decoded = decryptJson(blob);
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          throw new IntegrationCredentialsError(
            `decrypted credentials for integration_account ${integrationAccountId} is not a JSON object`,
          );
        }
        return decoded as Record<string, unknown>;
      } catch (err) {
        if (err instanceof PanelCryptoError) {
          throw new IntegrationCredentialsError(
            `failed to decrypt credentials for integration_account ${integrationAccountId}: ${err.message}`,
          );
        }
        throw err;
      }
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
