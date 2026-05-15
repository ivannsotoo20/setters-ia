-- 055-prompt-block-versions-no-mutations.sql
-- Hardening 2026-05-15 (audit MEDIUM M-1): prompt_block_versions append-only.
-- SELECT existente desde migration 016. Añadimos policies INSERT/UPDATE/DELETE
-- que denegan TODO desde anon/authenticated. Service_role bypassa RLS.

CREATE POLICY prompt_block_versions_no_inserts ON public.prompt_block_versions
  FOR INSERT WITH CHECK (false);
CREATE POLICY prompt_block_versions_no_updates ON public.prompt_block_versions
  FOR UPDATE USING (false);
CREATE POLICY prompt_block_versions_no_deletes ON public.prompt_block_versions
  FOR DELETE USING (false);

COMMENT ON POLICY prompt_block_versions_no_inserts ON public.prompt_block_versions IS
  'Snapshot histórico append-only. INSERT solo vía service_role (motor/panel). Anon/authenticated denied.';
