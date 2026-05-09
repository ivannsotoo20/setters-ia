-- Migration 019 — notification_events (Sprint Gamma 2.4)
--
-- Cola de notificaciones por email al trainer via Resend. Una row por evento.
-- El cron notify-tick lee pending → renderiza template → envía vía sendEmail
-- → marca sent/failed. Retry con backoff exponencial.
--
-- Eventos soportados (set fijo, el trainer elige cuáles via multi-select en
-- Sprint Gamma 2.5):
--   - 'handoff': IA marcó handoff_to_human=true (causa A/B/C/D del Cerebro).
--   - 'qualified': lead pasó criterios universales de cualificación.
--   - 'appointment_booked': lead agendó videollamada (F6).
--   - 'descalified': lead disparó alguna causa de descualificación (D1-D9).
--   - 'paused_by_rule': trainer escribió manual desde GHL → IA pausada.
--   - 'error_motor': pipeline falló N veces consecutivas en una conversación.

CREATE TABLE IF NOT EXISTS public.notification_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'handoff', 'qualified', 'appointment_booked', 'descalified',
    'paused_by_rule', 'error_motor'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'failed', 'skipped'
  )),
  sent_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON public.notification_events(next_attempt_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_events_tenant
  ON public.notification_events(tenant_id, created_at DESC);

COMMENT ON TABLE public.notification_events IS
  'Cola de notificaciones email al trainer (Resend). Sprint Gamma 2.4. Cron notify-tick procesa pending. Retry con backoff [1m, 5m, 30m]. Skipped = trainer no suscrito a ese event_type.';

DROP TRIGGER IF EXISTS notification_events_set_updated_at
  ON public.notification_events;
CREATE TRIGGER notification_events_set_updated_at
  BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant member reads own notifications"
  ON public.notification_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = notification_events.tenant_id OR p.is_agency_admin = true)
    )
  );
