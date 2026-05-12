-- 046-audit-log-allow-cascade.sql
-- Fix del trigger de audit-log immutability (migration 044): permitir DELETE
-- en cascade desde tenants (DELETE FROM tenants WHERE id=X tira ON DELETE CASCADE
-- al audit_log). Sin esto, no se puede borrar un tenant nunca.
--
-- Detección: pg_trigger_depth() > 1 indica que el trigger se disparó como parte
-- de una cascade desde otro trigger/operación. El audit log directo desde un
-- admin malicioso tendría depth = 1 → seguimos bloqueando.
--
-- UPDATE sigue 100% bloqueado (no hay cascade para UPDATE en tenant_audit_log).

CREATE OR REPLACE FUNCTION public.tenant_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Permitir si la operación viene de una cascade (depth > 1 al disparar).
  -- Esto pasa cuando DELETE FROM tenants WHERE id=X propaga el cascade.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'tenant_audit_log is append-only — direct UPDATE/DELETE denied'
    USING ERRCODE = '42501';
END
$fn$;
