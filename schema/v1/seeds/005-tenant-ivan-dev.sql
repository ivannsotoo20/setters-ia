-- ============================================================================
-- Seed 005: tenant 'ivan-dev' (Ivan / Fyzon Sandbox) + config + canal WA YCloud
-- + token webhook YCloud + integration_account placeholder
-- Idempotente.
-- ============================================================================
-- Pendiente externo (Ivan rellena tras aplicar):
--   UPDATE public.integration_accounts
--   SET credentials = '{"api_key": "<YCLOUD_API_KEY_REAL>"}'::jsonb,
--       connection_config = '{"business_phone": "<+34XXXXXXXXX>"}'::jsonb
--   WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'ivan-dev')
--     AND provider = 'ycloud';
-- ============================================================================

BEGIN;

-- 1. Tenant
INSERT INTO public.tenants (slug, name, is_active, settings)
VALUES (
  'ivan-dev',
  'Ivan / Fyzon Sandbox',
  TRUE,
  '{"notes":"Tenant de pruebas para validar motor end-to-end con WhatsApp via YCloud"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

-- 2. Config por defecto (mismo perfil que Montefit; Ivan puede acelerar delays para tests)
INSERT INTO public.tenant_configs (
  tenant_id,
  active_conversation_delay,
  idle_conversation_delay,
  debounce_window_seconds,
  max_messages_per_conversation,
  timezone
)
SELECT
  t.id,
  '30 seconds'::interval,
  '5 minutes'::interval,
  25,
  25,
  'Europe/Madrid'
FROM public.tenants t
WHERE t.slug = 'ivan-dev'
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Token para el webhook YCloud
INSERT INTO public.tenant_tokens (tenant_id, purpose, is_active)
SELECT t.id, 'ycloud_webhook', TRUE
FROM public.tenants t
WHERE t.slug = 'ivan-dev'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_tokens tt
    WHERE tt.tenant_id = t.id
      AND tt.purpose = 'ycloud_webhook'
      AND tt.is_active = TRUE
  );

-- 4. Canal WhatsApp via YCloud
INSERT INTO public.channels (tenant_id, channel_type, via_provider, label, is_active)
SELECT t.id, 'whatsapp'::channel_type, 'ycloud'::channel_provider, 'WA Ivan via YCloud', TRUE
FROM public.tenants t
WHERE t.slug = 'ivan-dev'
ON CONFLICT (tenant_id, channel_type, via_provider, label) DO NOTHING;

-- 5. Integration account placeholder (api_key y business_phone se rellenan post-seed)
INSERT INTO public.integration_accounts (
  tenant_id,
  channel_id,
  provider,
  credentials,
  connection_config,
  is_active
)
SELECT
  t.id,
  c.id,
  'ycloud'::channel_provider,
  '{"api_key": "REPLACE_ME_YCLOUD_API_KEY"}'::jsonb,
  '{"business_phone": "REPLACE_ME_E164"}'::jsonb,
  TRUE
FROM public.tenants t
JOIN public.channels c
  ON c.tenant_id = t.id
 AND c.channel_type = 'whatsapp'
 AND c.via_provider = 'ycloud'
WHERE t.slug = 'ivan-dev'
  AND NOT EXISTS (
    SELECT 1 FROM public.integration_accounts ia
    WHERE ia.tenant_id = t.id
      AND ia.provider = 'ycloud'
      AND ia.channel_id = c.id
  );

COMMIT;

-- Verificación
SELECT t.id AS tenant_id, t.slug, t.name,
       cfg.debounce_window_seconds, cfg.timezone,
       tk.token AS webhook_token, tk.purpose,
       ch.id AS channel_id, ch.channel_type, ch.via_provider, ch.label,
       ia.id AS integration_account_id, ia.provider,
       ia.credentials ? 'api_key' AS has_api_key,
       ia.connection_config ? 'business_phone' AS has_business_phone
FROM public.tenants t
LEFT JOIN public.tenant_configs cfg ON cfg.tenant_id = t.id
LEFT JOIN public.tenant_tokens tk
  ON tk.tenant_id = t.id AND tk.purpose = 'ycloud_webhook'
LEFT JOIN public.channels ch
  ON ch.tenant_id = t.id AND ch.via_provider = 'ycloud'
LEFT JOIN public.integration_accounts ia
  ON ia.tenant_id = t.id AND ia.provider = 'ycloud'
WHERE t.slug = 'ivan-dev';
