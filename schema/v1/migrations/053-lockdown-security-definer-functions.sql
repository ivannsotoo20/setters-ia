-- 053-lockdown-security-definer-functions.sql
-- Hardening 2026-05-15: lockdown de funciones SECURITY DEFINER.
-- 10 funciones sin search_path / sin REVOKE EXECUTE. Las trigger-functions no se
-- llaman nunca por RPC; solo el sistema vía trigger las dispara. Pero PostgREST
-- las expone vía /rest/v1/rpc/* y el advisor las flagea.
--
-- Tratamiento:
--   - Trigger functions (7): SET search_path = public, pg_temp + REVOKE TOTAL.
--   - utility/touch (3 más): igual tratamiento.
--   - tenant_id_for_user: helper RLS. Mantiene EXECUTE para authenticated.
--   - provision_tenant: ya tiene REVOKE FROM PUBLIC + GRANT TO service_role. Add explicit anon/auth REVOKE.

-- Trigger functions: set search_path + REVOKE total
ALTER FUNCTION public.cancel_followups_on_lead_reply() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.cancel_followups_on_lead_reply() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.log_outcome_label_change() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.log_outcome_label_change() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.log_phase_change() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.log_phase_change() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.seed_dashboard_widgets_on_new_tenant() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.seed_dashboard_widgets_on_new_tenant() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.seed_followup_config_on_new_tenant() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.seed_followup_config_on_new_tenant() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.seed_system_labels_on_new_tenant() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.seed_system_labels_on_new_tenant() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.update_lead_last_message_at() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.update_lead_last_message_at() FROM PUBLIC, anon, authenticated;

-- Utility / touch triggers
ALTER FUNCTION public.profiles_touch_updated_at() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.profiles_touch_updated_at() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_updated_at_now() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.set_updated_at_now() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.tenant_audit_log_immutable() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.tenant_audit_log_immutable() FROM PUBLIC, anon, authenticated;

-- tenant_id_for_user: helper RLS. authenticated SÍ debe poder ejecutarla.
REVOKE EXECUTE ON FUNCTION public.tenant_id_for_user() FROM PUBLIC, anon;
-- (authenticated mantiene su acceso natural)

-- provision_tenant: ya tiene REVOKE FROM PUBLIC, hacemos explícito anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM anon, authenticated;

-- Quitar policy de listing amplia del bucket avatars (Hardening 2026-05-15).
-- El panel solo usa getPublicUrl + upload, no .list()/.download(). La policy
-- amplia permitía enumerar todos los archivos. La URL pública sigue funcionando
-- porque para "public bucket" la URL se sirve sin policy SELECT.
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
