-- 054-prompt-block-drafts-tenant-check.sql
-- Hardening 2026-05-15 (audit MEDIUM M-2): prompt_block_drafts ahora valida
-- tenant_id además de owner_user_id. Defense-in-depth: si un user es
-- transferido entre tenants, sus drafts viejos no quedan accesibles desde el
-- nuevo tenant.

DROP POLICY IF EXISTS "owner reads own draft" ON public.prompt_block_drafts;
DROP POLICY IF EXISTS "owner writes own draft" ON public.prompt_block_drafts;

CREATE POLICY prompt_block_drafts_owner_tenant ON public.prompt_block_drafts
  FOR ALL
  USING (
    owner_user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR tenant_id = public.tenant_id_for_user()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = TRUE)
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR tenant_id = public.tenant_id_for_user()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = TRUE)
    )
  );

COMMENT ON POLICY prompt_block_drafts_owner_tenant ON public.prompt_block_drafts IS
  'Owner-y-tenant: el draft solo es visible para su owner Y si pertenece al tenant del owner (o tenant_id NULL = bloque shared). Agency admin bypassa.';
