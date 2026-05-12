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
  const plain = row.credentials;
  const hasPlainFallback = plain !== null && plain !== undefined && typeof plain === 'object';

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
          // Sprint Bugfix 2026-05-12 — si el decrypt falla (typically porque
          // `CREDENTIALS_ENCRYPTION_KEY` del panel Vercel no coincide con la
          // del motor VPS), caemos al `credentials` plain legacy si está
          // poblado. NO bloquear el envío manual del trainer por un problema
          // de sync de env vars que se puede resolver más tarde.
          if (hasPlainFallback) {
            console.warn(
              `[integration-credentials] decrypt failed for integration_account ${integrationAccountId} (${err.message}); falling back to plain legacy credentials`,
            );
            return plain as Record<string, unknown>;
          }
          throw new IntegrationCredentialsError(
            `failed to decrypt credentials for integration_account ${integrationAccountId}: ${err.message} (no plain legacy fallback available — set CREDENTIALS_ENCRYPTION_KEY in Vercel env to match the motor VPS .env.local)`,
          );
        }
        throw err;
      }
    }
  }
  if (hasPlainFallback) {
    return plain as Record<string, unknown>;
  }
  throw new IntegrationCredentialsError(
    `integration_account ${integrationAccountId} has neither credentials_encrypted nor credentials populated`,
  );
}
