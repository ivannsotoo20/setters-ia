-- =============================================================================
-- Migration 069 — leads: columnas de inferencia nombre + genero (Hito 12.2 Fase B)
-- =============================================================================
--
-- Hito 12.2 Fase B (2026-05-20): el motor infiere en F0 (al crear lead nuevo)
-- si los datos GHL/ManyChat/YCloud aportan un nombre humano legible y, si el
-- trainer filtra por genero, intenta inferir el genero del lead. Resultado
-- persiste en `leads` para reutilizar en cada turno sin recalcular.
--
-- Detección: heurística regex síncrona barata → si ambiguo, fallback Haiku
-- (~$0.0001-0.0003 por lead). Solo se ejecuta una vez por lead en F0.
--
-- Columnas nuevas:
--   - parsed_name TEXT: el nombre humano detectado (ej "Andrea", "Andrea Martínez").
--     NULL si parsed_name_status != 'usable'.
--   - parsed_name_status TEXT: 'usable' | 'not_usable' | 'unknown'. Enum suelto
--     (CHECK), no nuevo tipo PG para simplicidad.
--       * 'usable': hay un nombre humano que el setter puede usar al dirigirse al lead.
--       * 'not_usable': los datos solo aportan un handle no legible (andrea12345, user2381).
--       * 'unknown': no se pudo determinar (sin datos suficientes en el momento).
--   - detected_gender TEXT: 'male' | 'female' | 'ambiguous' | 'unknown'.
--       * 'ambiguous': el nombre es válido (María, Carlos) PERO no permite inferir
--         género con confianza (Sam, Alex, Jordan, Pat, etc.).
--       * 'unknown': sin datos suficientes o sin nombre usable.
--   - name_gender_detected_at TIMESTAMPTZ: cuándo se ejecutó la última inferencia.
--     Permite re-detectar si los datos del lead cambian (ej GHL aporta firstName
--     después de un upsert posterior).
--
-- Compat: las 4 columnas son NULL por defecto. Tenants existentes (leads ya
-- creados antes de esta migration) tienen NULL en las 4 columnas hasta que
-- una nueva interacción dispare la re-detección (o un script de backfill, no
-- entregado en Fase B).
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS parsed_name TEXT,
  ADD COLUMN IF NOT EXISTS parsed_name_status TEXT,
  ADD COLUMN IF NOT EXISTS detected_gender TEXT,
  ADD COLUMN IF NOT EXISTS name_gender_detected_at TIMESTAMPTZ;

-- CHECK constraints como statements separados para que sean idempotentes via IF NOT EXISTS pattern.
-- Postgres no soporta IF NOT EXISTS en CHECK directamente; usamos DO blocks defensivos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_parsed_name_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_parsed_name_status_check
      CHECK (parsed_name_status IS NULL OR parsed_name_status IN ('usable', 'not_usable', 'unknown'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_detected_gender_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_detected_gender_check
      CHECK (detected_gender IS NULL OR detected_gender IN ('male', 'female', 'ambiguous', 'unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.parsed_name IS
  'Hito 12.2 — Nombre humano detectado del lead (ej "Andrea") tras análisis heurístico + Haiku. NULL si parsed_name_status != usable.';
COMMENT ON COLUMN public.leads.parsed_name_status IS
  'Hito 12.2 — usable | not_usable | unknown. usable = hay nombre humano legible; not_usable = solo handles (andrea12345, user2381); unknown = sin datos suficientes.';
COMMENT ON COLUMN public.leads.detected_gender IS
  'Hito 12.2 — male | female | ambiguous | unknown. Inferencia del genero del lead a partir del nombre detectado. ambiguous = nombre valido pero no permite inferir genero (Sam, Alex).';
COMMENT ON COLUMN public.leads.name_gender_detected_at IS
  'Hito 12.2 — timestamp de la ultima inferencia de nombre + genero. Permite re-detectar cuando los datos del lead cambian.';
