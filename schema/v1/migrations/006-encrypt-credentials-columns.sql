-- ============================================================================
-- Migration 006: encrypt credentials at-rest (Hardening 1.1)
-- ============================================================================
-- Añade columna `credentials_encrypted JSONB` a `integration_accounts`.
-- Shape esperado: `{ "blob": "v1:<iv_b64>:<ciphertext_b64>:<tag_b64>" }`
-- donde el blob es el resultado de cifrar `JSON.stringify(credentials)` con
-- AES-256-GCM (lib `apps/motor-agente/src/lib/crypto.ts`).
--
-- La columna `credentials` (plain JSONB) se conserva durante la transición.
-- El backfill se hace con `node scripts/encrypt-credentials.mjs` (idempotente).
-- Cuando todos los registros tengan `credentials_encrypted` y el motor lea
-- únicamente de la columna nueva, una migration posterior dropea `credentials`.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.integration_accounts
  ADD COLUMN IF NOT EXISTS credentials_encrypted JSONB;

COMMENT ON COLUMN public.integration_accounts.credentials_encrypted IS
  'AES-256-GCM at-rest encryption of credentials JSON. Shape: {"blob":"v1:iv:ct:tag"}. Decryption requires CREDENTIALS_ENCRYPTION_KEY env var.';

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- Esperado: ambas columnas existen. credentials seguirá poblado hasta el drop.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'integration_accounts'
  AND column_name IN ('credentials', 'credentials_encrypted')
ORDER BY column_name;
