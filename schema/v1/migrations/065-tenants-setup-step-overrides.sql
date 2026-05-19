-- =============================================================================
-- Migration 065 — tenants: setup_step_overrides JSONB
-- Sprint Iota.5 PR-E
-- =============================================================================
--
-- Cuando el trainer pulsa "Marcar como ya hecho (omitir verificación)" en un
-- paso del wizard onboarding, ese paso se considera completado a efectos del
-- progress bar + `Marcar setup como completo`, aunque la verificación
-- automática (token grabado, plantilla designada, etc.) no haya pasado.
--
-- Iván decisión (2026-05-19): el override CUENTA para cerrar
-- `tenants.onboarded_at` — el trainer asume responsabilidad. Disclaimer claro
-- en el dialog antes de aplicar el override.
--
-- Shape: { "1": true, "2": true, ... } indexado por step index (1..4).
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS setup_step_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants.setup_step_overrides IS
  'Override manual del wizard onboarding: {stepIndex: true} marca el paso como completado por el trainer aunque la verificación real no haya pasado. Sprint Iota.5 PR-E.';
