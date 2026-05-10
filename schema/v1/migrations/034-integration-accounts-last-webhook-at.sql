-- Hito 9 — last_webhook_at por integration_account para dashboard de salud.
--
-- Por qué: el dashboard /settings/integrations/health (sub-fase 6 del Hito 9)
-- necesita mostrar al trainer cuándo recibió el último webhook por cada
-- integration_account (GHL Workflow, ManyChat, YCloud, lead-form). Si una
-- integración deja de recibir webhooks (trainer rompió automation, cambió URL,
-- token revocado), el dashboard lo marca en 🟠/🔴.
--
-- Hooks: webhook-ghl.ts, webhook-manychat.ts, webhook-ycloud.ts y el nuevo
-- automation-lead-form.ts hacen UPDATE best-effort de esta columna tras dedup.

BEGIN;

ALTER TABLE public.integration_accounts
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_integration_accounts_last_webhook_at
  ON public.integration_accounts (tenant_id, last_webhook_at DESC);

COMMENT ON COLUMN public.integration_accounts.last_webhook_at IS
  'Timestamp del último webhook recibido para esta cuenta. Lo actualizan los handlers webhook-{ghl,manychat,ycloud}.ts y automation-lead-form.ts. Lo lee el dashboard /settings/integrations/health.';

COMMIT;
