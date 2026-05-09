-- Migration 020 — Multi-user per tenant: añade columnas para flujo de invitación.
--
-- Sprint Epsilon (2026-05-09): habilita que una sub-cuenta tenga múltiples
-- usuarios (owner + collaborators) con tracking de invitación + estado activo.
--
-- NOTAS:
--   - Reutilizamos `profiles.role` existente (enum profile_role: owner/admin/viewer).
--   - UI expone solo 2 opciones lógicas: Owner + Colaborador (=role 'admin').
--   - `viewer` se mantiene en el enum para uso futuro (read-only).
--   - `tenant_id` sigue NOT NULL — todo profile pertenece a una sub-cuenta.
--     Agency admin (is_agency_admin=true) tiene tenant_id de su propia agencia (1).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_active
  ON public.profiles(tenant_id, is_active);

COMMIT;
