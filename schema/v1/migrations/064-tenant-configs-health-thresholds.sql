-- =============================================================================
-- Migration 064 — tenant_configs: health thresholds amber/red configurables
-- Sprint Iota.5 PR-D
-- =============================================================================
--
-- Cada tenant puede ajustar cuándo una integración se considera ámbar/roja en
-- el dashboard de salud. Defaults agresivos (decisión Iván 2026-05-19): 12h
-- ámbar, 72h rojo. Para tenants con baja actividad esperada (campañas trimestrales)
-- el trainer puede subirlos en /settings/integrations?tab=health.
-- =============================================================================

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS health_threshold_hours_amber INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS health_threshold_hours_red   INTEGER NOT NULL DEFAULT 72;

ALTER TABLE public.tenant_configs DROP CONSTRAINT IF EXISTS tenant_configs_health_thresholds_check;
ALTER TABLE public.tenant_configs
  ADD CONSTRAINT tenant_configs_health_thresholds_check
  CHECK (
    health_threshold_hours_amber >= 1
    AND health_threshold_hours_red > health_threshold_hours_amber
    AND health_threshold_hours_red <= 720
  );

COMMENT ON COLUMN public.tenant_configs.health_threshold_hours_amber IS
  'Webhook silence > N horas → ámbar en dashboard. Default 12 (Sprint Iota.5).';
COMMENT ON COLUMN public.tenant_configs.health_threshold_hours_red IS
  'Webhook silence > N horas → rojo en dashboard + email alert (si suscrito). Default 72 (Sprint Iota.5).';
