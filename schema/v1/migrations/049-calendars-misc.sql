-- Hito 10 — Calendarios GHL: columnas misceláneas.
-- 1) conversations.last_appointment_id: link a la última cita (para ver detalle desde la ficha conv).
-- 2) leads.tracking_uuid: slug público opaco (16 chars b64url) que el motor inyecta en URLs de booking.
-- 3) tenant_configs.ghl_fyzon_uuid_field_id: cache del customFieldId GHL (creado vía ensureCustomField).
-- Migration aplicada en MCP supabase-fyzon con el nombre `037_calendars_misc`.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_appointment_id BIGINT
    REFERENCES public.calendar_appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_last_appointment
  ON public.conversations (last_appointment_id)
  WHERE last_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.last_appointment_id IS
  'Última cita asociada a la conversación. Se setea cuando AppointmentCreate matchea al lead. Hito 10.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tracking_uuid TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_leads_tracking_uuid
  ON public.leads (tracking_uuid) WHERE tracking_uuid IS NOT NULL;

COMMENT ON COLUMN public.leads.tracking_uuid IS
  'Slug público opaco (16 chars b64url) que el motor inyecta en URLs de booking trackable. Se genera on-demand en buildTrackedBookingUrl. Hito 10.';

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS ghl_fyzon_uuid_field_id TEXT;

COMMENT ON COLUMN public.tenant_configs.ghl_fyzon_uuid_field_id IS
  'ID del custom field GHL fyzon_lead_uuid (creado vía ensureCustomField). Cacheado para evitar re-crear. Hito 10.';
