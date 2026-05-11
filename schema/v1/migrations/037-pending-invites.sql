-- 037-pending-invites.sql
-- Hito 10 sub-fase 1 — Tabla pending_invites para flujo invitation-only.
--
-- Contexto (Hito 10 plan, 2026-05-11):
--   - Decisión B2B premium: signup público desaparece. El agency admin (Iván) crea
--     tenants y INVITA explícitamente a sus owners/colaboradores. Otros agency
--     admins también se invitan desde /admin/admins.
--   - Cada invite genera un token aleatorio de 32 bytes (hex) que expira a los 7 días.
--   - Al aceptar (formulario /accept-invite), se crea row en auth.users via
--     service_role + INSERT en public.profiles + UPDATE pending_invites.accepted_at.
--   - Audit log via tenant_audit_log: action='invite.created'|'invite.accepted'|'invite.revoked'.
--
-- Reglas duras:
--   - is_agency_admin=TRUE  => tenant_id IS NULL (invite a admin agency, sin tenant).
--   - is_agency_admin=FALSE => tenant_id IS NOT NULL (invite a miembro de tenant).
--   - Sólo puede haber UN invite activo (no aceptado y no revocado) por
--     (email, tenant_id) — el unique index parcial lo refuerza.
--   - Solo service_role escribe esta tabla (server actions con cliente service-role).
--     RLS aquí gobierna SELECT desde el cliente normal del panel.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id                BIGSERIAL PRIMARY KEY,
  email             CITEXT NOT NULL,
  tenant_id         BIGINT REFERENCES public.tenants(id) ON DELETE CASCADE,
  role              profile_role NOT NULL DEFAULT 'owner',
  is_agency_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  token             TEXT NOT NULL UNIQUE,
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  full_name_hint    TEXT,
  CONSTRAINT chk_admin_or_tenant CHECK (
    (is_agency_admin = TRUE  AND tenant_id IS NULL) OR
    (is_agency_admin = FALSE AND tenant_id IS NOT NULL)
  )
);

-- Solo un invite activo por (email+tenant) — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invites_email_tenant_active
  ON public.pending_invites (lower(email::text), tenant_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Lookup rápido por token al aceptar invite (solo activos).
CREATE INDEX IF NOT EXISTS idx_pending_invites_token_active
  ON public.pending_invites (token)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Lista de invites pendientes por tenant para UI /admin/tenants/[id]/members.
CREATE INDEX IF NOT EXISTS idx_pending_invites_tenant_invited_at
  ON public.pending_invites (tenant_id, invited_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Audit/listado de invites de agency admins.
CREATE INDEX IF NOT EXISTS idx_pending_invites_agency_admin
  ON public.pending_invites (invited_at DESC)
  WHERE is_agency_admin = TRUE AND accepted_at IS NULL AND revoked_at IS NULL;

-- ============================================================
-- RLS — Row Level Security
-- ============================================================
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Lectura desde cliente normal: agency admin ve todos; owner solo los de su tenant.
DROP POLICY IF EXISTS "pending_invites_read" ON public.pending_invites;
CREATE POLICY "pending_invites_read" ON public.pending_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = TRUE
        AND (
          p.is_agency_admin = TRUE
          OR (
            pending_invites.is_agency_admin = FALSE
            AND p.tenant_id = pending_invites.tenant_id
            AND p.role = 'owner'
          )
        )
    )
  );

-- INSERT/UPDATE/DELETE: solo desde service_role (server actions). Sin policies
-- para esos verbs → RLS los rechaza por defecto desde cliente normal.

COMMIT;
