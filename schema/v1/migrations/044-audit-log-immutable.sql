-- 044-audit-log-immutable.sql
-- Triggers BEFORE UPDATE/DELETE en tenant_audit_log que bloquean cualquier intento
-- (incluso desde service_role) de modificar o eliminar entradas. Append-only enforced.
--
-- Esta versión es la baseline. La migration 046 ajusta el comportamiento para
-- permitir DELETE en cascade (sin eso, no se puede borrar un tenant completo).
--
-- GDPR right-to-erasure: si hay que anonimizar un actor_user_id, hacerlo puntualmente
-- desde Supabase Studio con SET LOCAL session_replication_role = 'replica' (bypassa triggers).

CREATE OR REPLACE FUNCTION public.tenant_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'tenant_audit_log is append-only — UPDATE/DELETE denied'
    USING ERRCODE = '42501';
END
$fn$;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON public.tenant_audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON public.tenant_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tenant_audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON public.tenant_audit_log;
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON public.tenant_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tenant_audit_log_immutable();
