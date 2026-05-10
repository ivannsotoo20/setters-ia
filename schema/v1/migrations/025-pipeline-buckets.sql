-- Sprint Kappa — Pipeline visual Kanban (4 pipelines: WA / FB / IG-in / IG-out)
-- Cambios:
--   1. Ampliar destination_bucket CHECK con 4 nuevos buckets (cancelled, no_show, recontact, lost).
--   2. Seed 4 nuevos system labels para tenants existentes (won = 'bought' Sprint Eta ya cubierto).
--   3. Update trigger seed_system_labels_on_new_tenant para incluir los 4 nuevos.
--   4. Tabla pipeline_events para funnel rates históricos + time-in-stage.
--   5. Trigger log_phase_change: cada UPDATE de phase_number INSERTa pipeline_events.
--   6. Trigger log_outcome_label_change: cada INSERT/DELETE en conversation_labels con bucket outcome → pipeline_events.
-- Aditivo. Cero impacto motor (parche defensivo en apply-system-labels.ts ortogonal).

BEGIN;

-- 1) Ampliar CHECK constraint de destination_bucket
ALTER TABLE public.tenant_labels
  DROP CONSTRAINT IF EXISTS tenant_labels_destination_bucket_check;
ALTER TABLE public.tenant_labels
  ADD CONSTRAINT tenant_labels_destination_bucket_check
  CHECK (destination_bucket IN (
    'chats','hot','done','bought',
    'cancelled','no_show','recontact','lost'
  ));

-- 2) Seed 4 nuevos system labels para tenants existentes
INSERT INTO public.tenant_labels
  (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Cita cancelada', '#f59e0b',
  'Cita agendada que se cancelo (manual o GHL)', TRUE, 'cancelled', TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels
  (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'No-Show', '#dc2626',
  'Lead no aparecio a la cita agendada', TRUE, 'no_show', TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels
  (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Recontacto', '#0ea5e9',
  'Lead a recontactar mas adelante', TRUE, 'recontact', FALSE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels
  (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Cierre perdido', '#64748b',
  'Lead que rechazo la oferta', TRUE, 'lost', TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 3) Actualizar trigger seed_system_labels_on_new_tenant para incluir los 4 nuevos
CREATE OR REPLACE FUNCTION public.seed_system_labels_on_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_labels
    (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
  VALUES
    (NEW.id, 'Hot Lead',        '#ef4444', 'Atencion humana urgente',           TRUE, 'hot',       TRUE),
    (NEW.id, 'Completado',      '#10b981', 'Cerrada o handoff Causa C',         TRUE, 'done',      FALSE),
    (NEW.id, 'Comprado',        '#a855f7', 'Compra confirmada GHL',             TRUE, 'bought',    TRUE),
    (NEW.id, 'Activo',          '#3b82f6', 'En curso',                          TRUE, 'chats',     FALSE),
    (NEW.id, 'Cita cancelada',  '#f59e0b', 'Cita cancelada manual o GHL',       TRUE, 'cancelled', TRUE),
    (NEW.id, 'No-Show',         '#dc2626', 'No aparecio a cita',                TRUE, 'no_show',   TRUE),
    (NEW.id, 'Recontacto',      '#0ea5e9', 'A recontactar mas adelante',        TRUE, 'recontact', FALSE),
    (NEW.id, 'Cierre perdido',  '#64748b', 'Rechazo la oferta',                 TRUE, 'lost',      TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Tabla pipeline_events para funnel rates + time-in-stage histórico
CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN ('phase_change','outcome_applied','outcome_removed')),
  from_value      TEXT,
  to_value        TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('motor','manual','rule','system_hook')),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_tenant_time
  ON public.pipeline_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_conv
  ON public.pipeline_events(conversation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_type_time
  ON public.pipeline_events(tenant_id, event_type, occurred_at DESC);

ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_events_read" ON public.pipeline_events;
CREATE POLICY "pipeline_events_read" ON public.pipeline_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = pipeline_events.tenant_id)));

-- 5) Trigger: cada UPDATE de phase_number INSERTa pipeline_events
CREATE OR REPLACE FUNCTION public.log_phase_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phase_number IS DISTINCT FROM OLD.phase_number THEN
    INSERT INTO public.pipeline_events
      (tenant_id, conversation_id, event_type, from_value, to_value, source, occurred_at)
    VALUES
      (NEW.tenant_id, NEW.id, 'phase_change',
       OLD.phase_number::TEXT, NEW.phase_number::TEXT,
       'motor', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_phase_change ON public.conversations;
CREATE TRIGGER trg_log_phase_change
  AFTER UPDATE OF phase_number ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.log_phase_change();

-- 6) Trigger: cada INSERT/DELETE en conversation_labels con bucket outcome → pipeline_events
CREATE OR REPLACE FUNCTION public.log_outcome_label_change()
RETURNS TRIGGER AS $$
DECLARE
  v_bucket TEXT;
  v_outcome_buckets TEXT[] := ARRAY['cancelled','no_show','recontact','bought','lost'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT destination_bucket INTO v_bucket
    FROM public.tenant_labels WHERE id = NEW.label_id;
    IF v_bucket = ANY(v_outcome_buckets) THEN
      INSERT INTO public.pipeline_events
        (tenant_id, conversation_id, event_type, to_value, source, occurred_at)
      VALUES
        (NEW.tenant_id, NEW.conversation_id, 'outcome_applied',
         v_bucket, NEW.applied_via, NEW.applied_at);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT destination_bucket INTO v_bucket
    FROM public.tenant_labels WHERE id = OLD.label_id;
    IF v_bucket = ANY(v_outcome_buckets) THEN
      INSERT INTO public.pipeline_events
        (tenant_id, conversation_id, event_type, to_value, source, occurred_at)
      VALUES
        (OLD.tenant_id, OLD.conversation_id, 'outcome_removed',
         v_bucket, 'manual', now());
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_outcome_label_insert ON public.conversation_labels;
CREATE TRIGGER trg_log_outcome_label_insert
  AFTER INSERT ON public.conversation_labels
  FOR EACH ROW EXECUTE FUNCTION public.log_outcome_label_change();

DROP TRIGGER IF EXISTS trg_log_outcome_label_delete ON public.conversation_labels;
CREATE TRIGGER trg_log_outcome_label_delete
  AFTER DELETE ON public.conversation_labels
  FOR EACH ROW EXECUTE FUNCTION public.log_outcome_label_change();

COMMIT;
