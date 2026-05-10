-- Sprint Iota — Followups manuales (one-shot) + plantillas reutilizables.
-- 1) followup_templates per-tenant (CRUD)
-- 2) Columnas extras en message_schedules para audit + config auto-cancel
-- 3) Trigger DB que auto-cancela followups pending cuando lead responde

BEGIN;

CREATE TABLE IF NOT EXISTS public.followup_templates (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  body          TEXT NOT NULL,
  description   TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_followup_templates_tenant
  ON public.followup_templates(tenant_id);

ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followup_templates_read" ON public.followup_templates;
CREATE POLICY "followup_templates_read" ON public.followup_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = followup_templates.tenant_id)));

ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS auto_cancel_on_reply BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES public.followup_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_message_schedules_pending_per_conv
  ON public.message_schedules(conversation_id, status)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.cancel_followups_on_lead_reply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'lead' THEN
    UPDATE public.message_schedules
    SET status = 'cancelled',
        last_error = 'auto-cancelled: lead replied at ' || NEW.sent_at::TEXT
    WHERE conversation_id = NEW.conversation_id
      AND status = 'pending'
      AND auto_cancel_on_reply = TRUE
      AND message_type = 'follow_up';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cancel_followups_on_lead_reply ON public.conversation_messages;
CREATE TRIGGER trg_cancel_followups_on_lead_reply
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.cancel_followups_on_lead_reply();

COMMIT;
