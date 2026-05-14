-- Hito 10 — Calendarios GHL: calendar_appointments.
-- Mirror local de citas GHL. Recibido vía webhook AppointmentCreate/Update/Delete.
-- lead_id NULL = booking huérfano (no matcheamos al lead que reservó).
-- match_method registra cómo se matcheó (uuid puro = confidence 100, phone = 80).
-- Migration aplicada en MCP supabase-fyzon con el nombre `036_calendar_appointments`.

CREATE TABLE IF NOT EXISTS public.calendar_appointments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_account_id BIGINT NOT NULL REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  external_appointment_id TEXT NOT NULL,
  external_contact_id TEXT,
  lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  appointment_status TEXT NOT NULL DEFAULT 'new'
    CHECK (appointment_status IN ('new', 'confirmed', 'cancelled', 'showed', 'noshow', 'invalid')),
  assigned_user_external_id TEXT,
  source TEXT,
  match_method TEXT CHECK (match_method IN ('fyzon_uuid', 'phone', 'unmatched')),
  match_confidence SMALLINT,
  notes TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start
  ON public.calendar_appointments (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_lead
  ON public.calendar_appointments (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_conv
  ON public.calendar_appointments (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_calendar
  ON public.calendar_appointments (calendar_account_id, start_at);

COMMENT ON TABLE public.calendar_appointments IS
  'Mirror local de citas GHL. Recibido vía webhook AppointmentCreate/Update/Delete. lead_id NULL = booking huérfano. Hito 10.';

ALTER TABLE public.calendar_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_appointments_tenant_isolation ON public.calendar_appointments
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
