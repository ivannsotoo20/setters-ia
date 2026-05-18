-- Hito 11 — Añade timezone IANA al lead, auto-rellenado por lead-ingest
-- a partir del prefijo telefónico (inferTimezoneFromPhone).
--
-- Aplicada vía MCP supabase-fyzon en producción el 2026-05-18.
-- Idempotente — ADD COLUMN IF NOT EXISTS.
--
-- Usado por el motor (process-debounced) para renderizar `humanLabel` de los
-- slots disponibles EN HORA DEL LEAD (no del trainer) y para inyectar el
-- placeholder `{{lead_timezone_label}}` en fase_6_v4 → el setter siempre
-- menciona la zona del lead al proponer horas cuando lead y trainer están
-- en husos distintos.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS timezone TEXT NULL;

COMMENT ON COLUMN public.leads.timezone IS
  'IANA timezone del lead. Auto-rellenado en lead-ingest por inferTimezoneFromPhone(phone). NULL si no se pudo inferir.';
