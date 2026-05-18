-- Hito 11 — Añade channel_kind al calendar_accounts para mapear calendarios
-- por canal (WhatsApp / Instagram / Facebook) con fallback any.
--
-- Aplicada vía MCP supabase-fyzon en producción (tenant Ivan / Pablo) el 2026-05-18.
-- Idempotente — ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--
-- Resolución del calendar en motor (load-available-slots / tracked-calendar-url /
-- book-appointment-from-slot):
--   1. Si la conversación tiene channelKind: buscar calendar default activo
--      con channel_kind = <kind>.
--   2. Si no hay match, fallback a calendar default activo con channel_kind IS NULL.
--   3. Si tampoco: null (motor cae a flow legacy).

ALTER TABLE public.calendar_accounts
  ADD COLUMN IF NOT EXISTS channel_kind public.channel_type NULL;

COMMENT ON COLUMN public.calendar_accounts.channel_kind IS
  'Si NULL, este calendar aplica a cualquier canal como fallback global. Si tiene valor (whatsapp/instagram_dm/facebook_messenger), solo se usa para conversaciones de ese canal.';

-- Reemplaza el UNIQUE parcial existente (1 default por tenant) por dos índices
-- parciales: 1 default por (tenant, channel_kind) cuando kind no es NULL +
-- 1 default por tenant cuando channel_kind IS NULL (calendar "any").
DROP INDEX IF EXISTS public.idx_calendar_accounts_one_default;
DROP INDEX IF EXISTS public.idx_calendar_accounts_one_default_per_channel;
DROP INDEX IF EXISTS public.idx_calendar_accounts_one_default_any;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_accounts_one_default_per_channel
  ON public.calendar_accounts (tenant_id, channel_kind)
  WHERE is_default = true AND is_active = true AND channel_kind IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_accounts_one_default_any
  ON public.calendar_accounts (tenant_id)
  WHERE is_default = true AND is_active = true AND channel_kind IS NULL;
