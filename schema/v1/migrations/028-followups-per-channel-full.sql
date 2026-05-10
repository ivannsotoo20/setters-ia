-- Sprint Iota.1 — Followups per-canal + YCloud sync + AI-personalize + config global.
-- Refactor mayor sobre 027 (que ya estaba aplicada en Supabase remoto desde PR #6 cerrado).

BEGIN;

-- A) Drop tabla 027 (PR #6 cerrado)
DROP TRIGGER IF EXISTS trg_cancel_followups_on_lead_reply ON public.conversation_messages;
DROP FUNCTION IF EXISTS public.cancel_followups_on_lead_reply() CASCADE;
DROP TABLE IF EXISTS public.followup_templates CASCADE;

-- B) Re-crear followup_templates per-canal + provider
CREATE TABLE public.followup_templates (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_id             BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  channel_kind          channel_type NOT NULL,
  provider              TEXT NOT NULL DEFAULT 'manual'
                          CHECK (provider IN ('manual','ycloud','meta_cloud','ghl')),
  body                  TEXT,
  description           TEXT,
  provider_template_id  TEXT,
  language              TEXT,
  category              TEXT
                          CHECK (category IS NULL OR category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status                TEXT NOT NULL DEFAULT 'approved'
                          CHECK (status IN ('pending','approved','rejected','disabled')),
  variables             JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_personalize        BOOLEAN NOT NULL DEFAULT FALSE,
  ai_guide              TEXT,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, channel_kind),
  CHECK (
    channel_kind != 'whatsapp'
    OR (provider != 'manual' AND provider_template_id IS NOT NULL AND language IS NOT NULL)
  ),
  CHECK (
    (NOT ai_personalize) OR (ai_guide IS NOT NULL AND length(ai_guide) > 0)
  )
);

CREATE INDEX idx_followup_templates_tenant_channel
  ON public.followup_templates(tenant_id, channel_kind);
CREATE INDEX idx_followup_templates_provider
  ON public.followup_templates(tenant_id, provider, status)
  WHERE provider IN ('ycloud','meta_cloud');

ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_templates_read" ON public.followup_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = followup_templates.tenant_id)));

-- C) tenant_followup_config (auto-followup global per-tenant)
CREATE TABLE IF NOT EXISTS public.tenant_followup_config (
  tenant_id              BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  window_start_hour      INT NOT NULL DEFAULT 9
                           CHECK (window_start_hour BETWEEN 0 AND 23),
  window_end_hour        INT NOT NULL DEFAULT 21
                           CHECK (window_end_hour BETWEEN 0 AND 23),
  window_timezone        TEXT NOT NULL DEFAULT 'Europe/Madrid',
  max_followups_per_lead INT NOT NULL DEFAULT 3
                           CHECK (max_followups_per_lead BETWEEN 1 AND 10),
  intervals_hours        INTEGER[] NOT NULL DEFAULT '{24,72,168}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.tenant_followup_config (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE public.tenant_followup_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_followup_config_read" ON public.tenant_followup_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = tenant_followup_config.tenant_id)));

CREATE OR REPLACE FUNCTION public.seed_followup_config_on_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_followup_config (tenant_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_followup_config ON public.tenants;
CREATE TRIGGER trg_seed_followup_config
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_followup_config_on_new_tenant();

-- D) Columnas extras message_schedules
ALTER TABLE public.message_schedules
  ADD COLUMN IF NOT EXISTS auto_cancel_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES public.followup_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','auto_inactivity','manual_pipeline')),
  ADD COLUMN IF NOT EXISTS sequence_index INT,
  ADD COLUMN IF NOT EXISTS ai_personalize BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_guide TEXT;

CREATE INDEX IF NOT EXISTS idx_message_schedules_pending_per_conv
  ON public.message_schedules(conversation_id, status)
  WHERE status = 'pending';

-- E) Trigger auto-cancel followups
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
