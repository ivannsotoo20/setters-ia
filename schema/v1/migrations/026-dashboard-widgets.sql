-- Sprint Lambda.2 — dashboard_widgets per-tenant.
-- Cada tenant tiene su lista de widgets ordenada. RLS read=miembros tenant,
-- write=admin+. Trigger auto-seed 7 widgets default al crear tenant nuevo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_key    TEXT NOT NULL,
  filter_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  position      INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_tenant
  ON public.dashboard_widgets(tenant_id, position);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_widgets_read" ON public.dashboard_widgets;
CREATE POLICY "dashboard_widgets_read" ON public.dashboard_widgets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND (p.is_agency_admin = TRUE OR p.tenant_id = dashboard_widgets.tenant_id)));

-- Default widgets seedeados a tenants existentes (7 KPIs base, sin filtros)
INSERT INTO public.dashboard_widgets (tenant_id, metric_key, filter_json, position)
SELECT t.id, m.metric_key, '{}'::jsonb, m.pos
FROM public.tenants t
CROSS JOIN (VALUES
  ('leads_total',        0),
  ('convs_active',       1),
  ('qualified',          2),
  ('scheduled',          3),
  ('won',                4),
  ('show_rate',          5),
  ('close_rate',         6)
) AS m(metric_key, pos)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_widgets dw WHERE dw.tenant_id = t.id
);

CREATE OR REPLACE FUNCTION public.seed_dashboard_widgets_on_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.dashboard_widgets (tenant_id, metric_key, filter_json, position)
  VALUES
    (NEW.id, 'leads_total',  '{}'::jsonb, 0),
    (NEW.id, 'convs_active', '{}'::jsonb, 1),
    (NEW.id, 'qualified',    '{}'::jsonb, 2),
    (NEW.id, 'scheduled',    '{}'::jsonb, 3),
    (NEW.id, 'won',          '{}'::jsonb, 4),
    (NEW.id, 'show_rate',    '{}'::jsonb, 5),
    (NEW.id, 'close_rate',   '{}'::jsonb, 6);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_dashboard_widgets ON public.tenants;
CREATE TRIGGER trg_seed_dashboard_widgets
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_dashboard_widgets_on_new_tenant();

COMMIT;
