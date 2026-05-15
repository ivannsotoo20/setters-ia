-- 050-enable-rls-pipeline-runs.sql
-- Habilita RLS en pipeline_runs (Hardening security 2026-05-15).
-- Tabla introducida en migration 009 sin RLS. El motor usa service_role (bypassa RLS),
-- el panel necesita poder leer agregados sin filtrar por tenant_id para is_agency_admin.
-- Policy: trainer ve su tenant, agency admin ve todo.

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_runs_tenant_isolation ON public.pipeline_runs;
CREATE POLICY pipeline_runs_tenant_isolation ON public.pipeline_runs
  FOR ALL
  USING (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_agency_admin = TRUE
    )
  )
  WITH CHECK (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_agency_admin = TRUE
    )
  );

COMMENT ON POLICY pipeline_runs_tenant_isolation ON public.pipeline_runs IS
  'Tenant member: solo su tenant_id. Agency admin: todos. Service_role bypassa RLS.';
