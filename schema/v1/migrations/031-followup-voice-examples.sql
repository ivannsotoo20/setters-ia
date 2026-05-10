-- Migration 031 — Sprint Iota.2 (voice tuning followups)
--
-- Añade campo opcional `followup_voice_examples` a tenant_followup_config.
-- El trainer puede pegar 3-5 ejemplos de cómo redactaría él mismo un
-- followup; estos se inyectan como few-shot al prompt de Haiku 4.5 al
-- materializar/regenerar followups, en lugar de los ejemplos genéricos
-- hardcodeados en el system prompt.
--
-- Combinado con la inyección del bloque coach_v3 del tenant en el system
-- prompt (cambio de código), permite que los followups suenen igual que
-- el setter que ya está respondiendo en tiempo real (consistencia de voz).
--
-- NULL = el sistema usa los ejemplos genéricos del prompt + coach_v3.
-- TEXTO = ejemplos del trainer (parseados por bloques separados por línea
-- en blanco) reemplazan los ejemplos genéricos.

ALTER TABLE public.tenant_followup_config
ADD COLUMN followup_voice_examples TEXT;

COMMENT ON COLUMN public.tenant_followup_config.followup_voice_examples IS
  'Sprint Iota.2 — Ejemplos opcionales (texto libre, separados por líneas en blanco) que el trainer escribe en /settings/followup-templates como few-shot para Haiku 4.5. Si NULL, se usan los ejemplos genéricos del prompt.';
