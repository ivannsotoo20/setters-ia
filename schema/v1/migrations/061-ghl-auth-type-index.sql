-- =============================================================================
-- Migration 061 — GHL auth_type backfill + índice parcial PIT
-- Sprint Iota.5 PR-B
-- =============================================================================
--
-- Contexto: el sistema soporta dos tipos de credenciales GHL coexistiendo:
--   - OAuth Marketplace (creado por `oauth-ghl.ts` callback): tokens
--     refrescados cada hora. Webhooks llegan a la URL Marketplace.
--   - Private Integration Token (PIT) v2.0 (BYOK desde panel
--     `/settings/integrations`): token `pit-xxxx` estático sin refresh.
--     Scopes granulares por trainer.
--
-- Hasta Sprint Iota.5, los rows BYOK NO se marcaban con `auth_type` explícito
-- en `connection_config`. Esta migration:
--   (1) Backfill: rows GHL sin `auth_type` y SIN credenciales OAuth (sin
--       `accessToken`+`refreshToken` en credentials cifradas) → marcar como
--       `auth_type='pit'`. NOTA: no podemos decifrar desde SQL, así que usamos
--       heurística: si la columna `connection_config` no tiene marker OAuth
--       (`expiresAt` o `installedAt`), asumimos PIT.
--   (2) Crea índice parcial para lookup rápido de rows PIT por tenant.
--
-- Idempotente. Safe re-run.
-- =============================================================================

-- (1) Backfill: GHL rows con OAuth (tienen connection_config.expiresAt) ya
--     tienen `auth_type='oauth'`. Confirmamos.
UPDATE public.integration_accounts
SET connection_config = jsonb_set(
  connection_config,
  '{auth_type}',
  '"oauth"'::jsonb
)
WHERE provider = 'ghl'
  AND is_active = TRUE
  AND connection_config ? 'expiresAt'           -- marker OAuth
  AND (NOT (connection_config ? 'auth_type')
       OR connection_config->>'auth_type' IS NULL
       OR connection_config->>'auth_type' = '');

-- (2) Backfill: GHL rows SIN marker OAuth → asumimos PIT (BYOK panel).
UPDATE public.integration_accounts
SET connection_config = jsonb_set(
  connection_config,
  '{auth_type}',
  '"pit"'::jsonb
)
WHERE provider = 'ghl'
  AND is_active = TRUE
  AND NOT (connection_config ? 'expiresAt')   -- no es OAuth refresh-based
  AND (NOT (connection_config ? 'auth_type')
       OR connection_config->>'auth_type' IS NULL
       OR connection_config->>'auth_type' = '');

-- (3) Índice parcial para lookup rápido motor → PIT row.
CREATE INDEX IF NOT EXISTS idx_integration_accounts_ghl_pit
  ON public.integration_accounts (tenant_id)
  WHERE provider = 'ghl'
    AND is_active = TRUE
    AND connection_config->>'auth_type' = 'pit';

-- (4) Índice parcial para lookup rápido motor → OAuth row (resolución webhook
--     por locationId en `resolveTenantByOauthLocation`).
CREATE INDEX IF NOT EXISTS idx_integration_accounts_ghl_oauth
  ON public.integration_accounts (tenant_id)
  WHERE provider = 'ghl'
    AND is_active = TRUE
    AND connection_config->>'auth_type' = 'oauth';

-- (5) Comment documentando los valores válidos de auth_type para humanos.
COMMENT ON COLUMN public.integration_accounts.connection_config IS
  'JSONB plain. Valores soportados de auth_type: ''oauth'' (Marketplace, refresh logic), ''pit'' (Private Integration v2.0 BYOK, sin refresh). Otros campos: locationId (GHL), business_phone (YCloud), wabaId, pageId (Meta). Datos sensibles van cifrados en credentials_encrypted.';

-- Verificación: cuenta filas por auth_type
DO $$
DECLARE
  v_oauth_count INTEGER;
  v_pit_count INTEGER;
  v_no_type_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_oauth_count
    FROM public.integration_accounts
    WHERE provider='ghl' AND is_active=TRUE
      AND connection_config->>'auth_type' = 'oauth';
  SELECT COUNT(*) INTO v_pit_count
    FROM public.integration_accounts
    WHERE provider='ghl' AND is_active=TRUE
      AND connection_config->>'auth_type' = 'pit';
  SELECT COUNT(*) INTO v_no_type_count
    FROM public.integration_accounts
    WHERE provider='ghl' AND is_active=TRUE
      AND (connection_config->>'auth_type' IS NULL
           OR connection_config->>'auth_type' = '');
  RAISE NOTICE 'GHL integration_accounts after backfill: oauth=%, pit=%, untyped=%',
    v_oauth_count, v_pit_count, v_no_type_count;
END $$;
