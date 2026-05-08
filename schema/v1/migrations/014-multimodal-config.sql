-- Migration 014 — Multimodal IA (Bloque D, 2026-05-08)
--
-- Añade configuración por tenant del idioma default de audio + columnas de
-- tracking de coste multimodal en pipeline_runs.
--
-- Idiomas: 'es' (default), 'en', 'auto'. Whisper-large-v3-turbo soporta 99+
-- idiomas; los 3 valores cubren los casos prácticos (forzar ES, forzar EN,
-- detectar). Cuando un tenant atiende audios mixtos → 'auto'.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS default_audio_language TEXT NOT NULL DEFAULT 'es'
    CHECK (default_audio_language IN ('es', 'en', 'auto'));

COMMENT ON COLUMN public.tenant_configs.default_audio_language IS
  'Idioma forzado para Groq Whisper transcripción de audios inbound. ''es''/''en'' optimizan calidad+velocidad; ''auto'' deja Whisper detectar.';

-- Tracking de coste multimodal por turno del pipeline. NULL si el turno no
-- tuvo media. Sumar a totals.cost_usd para coste real del turno.
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS multimodal_audio_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS multimodal_image_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multimodal_cost_usd NUMERIC;

COMMENT ON COLUMN public.pipeline_runs.multimodal_audio_seconds IS
  'Segundos totales de audio transcritos en este turno (Groq Whisper).';
COMMENT ON COLUMN public.pipeline_runs.multimodal_image_count IS
  'Número de imágenes descritas en este turno (Claude vision).';
COMMENT ON COLUMN public.pipeline_runs.multimodal_cost_usd IS
  'Coste agregado de transcripción + descripción multimodal en USD.';
