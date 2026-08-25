-- 076 — Cualificación de leads de formulario (2026-08-25).
--
-- Porta al motor el workflow n8n "Formulario Tally" de Tania: cuando alguien
-- rellena el formulario, se decide ANTES de enviar la plantilla de bienvenida
-- si merece la pena contactarle (país, cronicidad del dolor, capacidad
-- económica). El n8n se apaga; la decisión pasa a vivir en
-- apps/motor-agente/src/services/lead-qualifier.ts.
--
-- 1. `tenant_configs.lead_qualification` JSONB — config por tenant:
--    {
--      "enabled": true,
--      "pain_reject_values": ["Menos de 3 meses"],  -- respuesta literal que rechaza en seco
--      "country_label_regex": "vives|pais|país",     -- qué respuesta contiene el país
--      "ai_criteria": "<system prompt del evaluador>"
--    }
--    NULL o enabled=false → sin filtro (comportamiento anterior).
--
-- 2. Enum `llm_role` gana 'qualifier' para que la llamada del evaluador quede
--    en `llm_calls` con su coste — va contra la clave Anthropic del tenant.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS lead_qualification JSONB DEFAULT NULL;

COMMENT ON COLUMN public.tenant_configs.lead_qualification IS
  'Config de cualificación de leads de formulario (lead-form). NULL/enabled=false = sin filtro. Ver apps/motor-agente/src/services/lead-qualifier.ts';

ALTER TYPE public.llm_role ADD VALUE IF NOT EXISTS 'qualifier';
