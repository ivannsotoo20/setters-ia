-- Migration 075: clave propia de Anthropic por entrenador (BYOK opcional).
--
-- Por qué: hasta ahora el motor construía UN solo cliente Anthropic con la clave
-- de la plataforma, compartido por todos los tenants. El 2026-08-24 ese saldo se
-- agotó y dejó sin setter a TODOS los entrenadores a la vez. Con clave propia,
-- el que se queda sin crédito es solo quien lo gastó.
--
-- Opcional a propósito: si la columna está vacía se usa la clave de la
-- plataforma. Obligar a cada entrenador a abrir cuenta en Anthropic y meter
-- tarjeta antes de poder empezar es fricción que mata altas.
--
-- Formato idéntico al de `integration_accounts.credentials_encrypted`:
--   {"blob": "v1:<iv>:<ciphertext>:<tag>"}  (AES-256-GCM, lib/crypto.ts)
-- Nunca en claro: es una credencial de facturación de un tercero.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS anthropic_api_key_encrypted JSONB;

COMMENT ON COLUMN public.tenant_configs.anthropic_api_key_encrypted IS
  'Clave Anthropic propia del entrenador (BYOK), cifrada AES-256-GCM con el mismo '
  'formato que integration_accounts.credentials_encrypted: {"blob":"v1:iv:ct:tag"}. '
  'NULL = usa la clave de la plataforma. Solo la lee el motor con service_role.';

-- Huella de los últimos caracteres, para poder mostrar en el panel cuál está
-- puesta sin descifrar nada ni exponer la clave. La escribe la misma acción que
-- guarda la clave.
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS anthropic_api_key_hint TEXT;

COMMENT ON COLUMN public.tenant_configs.anthropic_api_key_hint IS
  'Últimos 4 caracteres de la clave Anthropic del entrenador, para mostrar en el '
  'panel ("…a1b2") sin descifrar. Nunca contiene la clave completa.';
