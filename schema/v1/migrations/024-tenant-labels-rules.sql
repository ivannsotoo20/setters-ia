-- Sprint Eta — Sistema de etiquetas (labels) por tenant + reglas auto + system labels
-- Cambios:
--   1. Columna dormida `conversations.ghl_opportunity_status` para Sprint Theta (webhook GHL won).
--   2. 3 tablas nuevas: tenant_labels, conversation_labels (M-N), label_automation_rules.
--   3. RLS read policies: viewer del tenant + agency admin.
--   4. Seed 4 system labels (Hot Lead / Completado / Comprado / Activo) para tenants existentes.
--   5. Trigger auto-seed para tenants nuevos.
-- Aditivo. Cero impacto sobre `automation_keywords` (origen) ni motor pipeline.

BEGIN;

-- 0) Columna dormida para futuro Sprint Theta (webhook GHL opportunity won)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ghl_opportunity_status TEXT;

-- 1) tenant_labels
CREATE TABLE IF NOT EXISTS public.tenant_labels (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name               TEXT   NOT NULL,
  color              TEXT   NOT NULL DEFAULT '#94a3b8',
  description        TEXT,
  is_system          BOOLEAN NOT NULL DEFAULT FALSE,
  destination_bucket TEXT CHECK (destination_bucket IN ('chats','hot','done','bought')),
  pause_ai_on_apply  BOOLEAN NOT NULL DEFAULT FALSE,
  resume_ai_on_apply BOOLEAN NOT NULL DEFAULT FALSE,
  auto_assign_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_labels_tenant ON public.tenant_labels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_labels_bucket
  ON public.tenant_labels(tenant_id, destination_bucket)
  WHERE destination_bucket IS NOT NULL;

-- 2) conversation_labels (M-N)
CREATE TABLE IF NOT EXISTS public.conversation_labels (
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label_id        BIGINT NOT NULL REFERENCES public.tenant_labels(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  applied_by      UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_via     TEXT   NOT NULL CHECK (applied_via IN ('manual','rule','system_hook')),
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_labels_label ON public.conversation_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_tenant ON public.conversation_labels(tenant_id);

-- 3) label_automation_rules
CREATE TABLE IF NOT EXISTS public.label_automation_rules (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label_id      BIGINT NOT NULL REFERENCES public.tenant_labels(id) ON DELETE CASCADE,
  trigger_type  TEXT   NOT NULL CHECK (trigger_type IN ('text_contains','text_exact','attachment','product','inactivity_hours','comment_keyword')),
  trigger_who   TEXT   NOT NULL CHECK (trigger_who IN ('lead','trainer','any')),
  trigger_value JSONB  NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_rules_active
  ON public.label_automation_rules(tenant_id, trigger_type, is_active)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_label_rules_label ON public.label_automation_rules(label_id);

-- 4) RLS read policies
ALTER TABLE public.tenant_labels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_labels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_labels_read" ON public.tenant_labels;
CREATE POLICY "tenant_labels_read" ON public.tenant_labels FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = tenant_labels.tenant_id)));

DROP POLICY IF EXISTS "conversation_labels_read" ON public.conversation_labels;
CREATE POLICY "conversation_labels_read" ON public.conversation_labels FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = conversation_labels.tenant_id)));

DROP POLICY IF EXISTS "label_automation_rules_read" ON public.label_automation_rules;
CREATE POLICY "label_automation_rules_read" ON public.label_automation_rules FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = label_automation_rules.tenant_id)));

-- 5) Seed 4 system labels para todos los tenants existentes
INSERT INTO public.tenant_labels (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Hot Lead',   '#ef4444', 'Conversación marcada para atención humana urgente',         TRUE, 'hot',    TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Completado', '#10b981', 'Conversación cerrada (fase final F6 o handoff Causa C)',   TRUE, 'done',   FALSE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Comprado',   '#a855f7', 'Lead que cerró compra (oportunidad GHL won)',               TRUE, 'bought', TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.tenant_labels (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Activo',     '#3b82f6', 'Conversación en curso (bucket por defecto)',                TRUE, 'chats',  FALSE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 6) Trigger auto-seed para tenants nuevos
CREATE OR REPLACE FUNCTION public.seed_system_labels_on_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_labels (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply) VALUES
    (NEW.id, 'Hot Lead',   '#ef4444', 'Atención humana urgente',     TRUE, 'hot',    TRUE),
    (NEW.id, 'Completado', '#10b981', 'Cerrada o handoff Causa C',   TRUE, 'done',   FALSE),
    (NEW.id, 'Comprado',   '#a855f7', 'Compra confirmada GHL',       TRUE, 'bought', TRUE),
    (NEW.id, 'Activo',     '#3b82f6', 'En curso',                    TRUE, 'chats',  FALSE)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_system_labels ON public.tenants;
CREATE TRIGGER trg_seed_system_labels
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_system_labels_on_new_tenant();

COMMIT;
