-- Migration 021 — tenant_audit_log: log de acciones admin sobre miembros + futuras acciones sensibles.
--
-- Sprint Epsilon (2026-05-09): tabla placeholder. Sprint Epsilon registra
-- eventos de tipo 'member.invited', 'member.password_reset',
-- 'member.role_changed', 'member.removed'. Sprints futuros podrán añadir
-- 'integration.changed', 'preferences.changed', 'coach.published', etc.
--
-- UI viewer queda fuera del sprint — los datos se acumulan desde ya.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON public.tenant_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.tenant_audit_log(action);

ALTER TABLE public.tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- Lectura: agency admin (is_agency_admin=true) o owner del tenant.
DROP POLICY IF EXISTS "audit_log_read" ON public.tenant_audit_log;
CREATE POLICY "audit_log_read" ON public.tenant_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_agency_admin = TRUE
          OR (p.tenant_id = tenant_audit_log.tenant_id AND p.role = 'owner')
        )
    )
  );

-- Sin policy de INSERT/UPDATE/DELETE: solo se escribe desde server actions
-- usando el cliente service_role (que bypasea RLS).

COMMIT;
