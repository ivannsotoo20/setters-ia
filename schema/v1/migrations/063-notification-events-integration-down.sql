-- =============================================================================
-- Migration 063 — notification_events: añadir event_type 'integration_down' + dedupe
-- Sprint Iota.5 PR-D
-- =============================================================================
--
-- Health alert email automático cuando una integración caída supera el
-- threshold rojo (default 72h). Reusa el cron `notify-tick` existente +
-- Resend.
--
-- El UNIQUE parcial previene email-flood: si una integración sigue caída en
-- el mismo "window" (bloque temporal calculado por el cron), no se enqueue
-- otra fila.
-- =============================================================================

ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'handoff'::text,
    'qualified'::text,
    'appointment_booked'::text,
    'descalified'::text,
    'paused_by_rule'::text,
    'error_motor'::text,
    'integration_down'::text
  ]));

-- Dedupe: 1 evento integration_down por (tenant, integration_account, window).
-- `window_key` lo calcula el cron como floor(age_hours / threshold_amber)
-- — así renotificamos solo cuando la integración cruza el siguiente bloque.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_integration_down_per_window
  ON public.notification_events (
    tenant_id,
    (payload->>'integration_account_id'),
    (payload->>'window_key')
  )
  WHERE event_type = 'integration_down';

COMMENT ON CONSTRAINT notification_events_event_type_check ON public.notification_events IS
  'Tipos de evento que el motor puede notificar. Sprint Iota.5 añadió integration_down (alerta de integración sin webhooks).';
