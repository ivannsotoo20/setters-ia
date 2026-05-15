-- 051-enable-rls-automation-keywords.sql
-- Habilita RLS en automation_keywords (Hardening security 2026-05-15).
-- Misma estructura que migration 050. El motor usa service_role.

ALTER TABLE public.automation_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_keywords_tenant_isolation ON public.automation_keywords;
CREATE POLICY automation_keywords_tenant_isolation ON public.automation_keywords
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

COMMENT ON POLICY automation_keywords_tenant_isolation ON public.automation_keywords IS
  'Tenant member: solo su tenant_id. Agency admin: todos. Service_role bypassa RLS.';
