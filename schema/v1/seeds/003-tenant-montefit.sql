-- ============================================================================
-- Seed 003: tenant 'montefit' (Pablo Montenegro) + config + token webhook ManyChat
-- Idempotente.
-- ============================================================================

BEGIN;

-- 1. Tenant
INSERT INTO public.tenants (slug, name, is_active, settings)
VALUES ('montefit', 'Montefit — Pablo Montenegro', TRUE, '{"notes":"Primer trainer real del motor Fyzon, carga 2026-04-20"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

-- 2. Config por defecto
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
WHERE t.slug = 'montefit'
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Token para el webhook ManyChat (el default del campo `token` genera un uuid)
INSERT INTO public.tenant_tokens (tenant_id, purpose, is_active)
SELECT t.id, 'manychat_webhook', TRUE
FROM public.tenants t
WHERE t.slug = 'montefit'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_tokens tt
    WHERE tt.tenant_id = t.id
      AND tt.purpose = 'manychat_webhook'
      AND tt.is_active = TRUE
  );

COMMIT;

-- Verificacion
SELECT t.id AS tenant_id, t.slug, t.name,
       c.debounce_window_seconds, c.timezone,
       tk.token AS webhook_token, tk.purpose
FROM public.tenants t
LEFT JOIN public.tenant_configs c ON c.tenant_id = t.id
LEFT JOIN public.tenant_tokens tk ON tk.tenant_id = t.id AND tk.purpose = 'manychat_webhook'
WHERE t.slug = 'montefit';
