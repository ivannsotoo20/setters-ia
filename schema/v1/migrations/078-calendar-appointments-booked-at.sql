-- 078 — calendar_appointments.booked_at (2026-09-12)
--
-- Cuándo se RESERVÓ la cita, no cuándo la vimos. El dashboard cuenta "citas
-- agendadas" por esta fecha. `received_at` no vale: para las citas que trae el
-- calendar-sync periódico (cuentas PIT como la de Tania, sin webhook) es el
-- momento del sync, y un backfill de un mes entero caería en el día de hoy.
--
-- Backfill de las filas existentes desde el payload guardado: el webhook guarda
-- `{type, locationId, appointment:{dateAdded}}`; el backfill antiguo guardaba el
-- appointment plano. Si no hay dateAdded utilizable, queda received_at.

ALTER TABLE public.calendar_appointments
  ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.calendar_appointments.booked_at IS
  'Cuándo se reservó la cita en GHL (appointment.dateAdded). Se fija al crear; Update/Delete no la tocan.';

UPDATE public.calendar_appointments
SET booked_at = COALESCE(
  CASE WHEN (payload #>> '{appointment,dateAdded}') ~ '^\d{4}-\d{2}-\d{2}'
       THEN (payload #>> '{appointment,dateAdded}')::timestamptz END,
  CASE WHEN (payload ->> 'dateAdded') ~ '^\d{4}-\d{2}-\d{2}'
       THEN (payload ->> 'dateAdded')::timestamptz END,
  received_at
);

CREATE INDEX IF NOT EXISTS idx_calendar_appointments_tenant_booked_at
  ON public.calendar_appointments (tenant_id, booked_at DESC);
