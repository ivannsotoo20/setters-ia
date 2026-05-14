-- Hito 10 — Calendarios GHL: calendar_accounts.
-- Vincula calendarios GHL (locationId+calendarId) al tenant. is_default marca el calendar
-- que usa el setter en F6 por defecto. UNIQUE parcial garantiza UN solo default por tenant.
-- Migration aplicada en MCP supabase-fyzon con el nombre `035_calendar_accounts`.

CREATE TABLE IF NOT EXISTS public.calendar_accounts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_account_id BIGINT NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'ghl' CHECK (provider IN ('ghl')),
  external_calendar_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  widget_base_url TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ghl_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_accounts_tenant_active
  ON public.calendar_accounts (tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_accounts_one_default
  ON public.calendar_accounts (tenant_id)
  WHERE is_default = TRUE;

COMMENT ON TABLE public.calendar_accounts IS
  'Calendarios GHL vinculados al SaaS por tenant. is_default marca el calendar que usa el setter en F6 por defecto. Hito 10.';

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_accounts_tenant_isolation ON public.calendar_accounts
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_agency_admin = TRUE
    )
  );
