-- =============================================================================
-- Migration 062 — Templates provider index
-- Sprint Iota.5 PR-C
-- =============================================================================
--
-- Contexto: el sistema soporta plantillas WA multi-provider (YCloud + GHL,
-- futuro Meta Cloud). El motor enruta el envío según `followup_templates.provider`.
--
-- Esta migration crea un índice parcial para acelerar las queries más
-- frecuentes del panel + motor:
--   - "Lista de templates aprobadas WA por provider del tenant"
--     (lista panel `/settings/followup-templates`).
--   - "Carga template por id + provider validation" (motor send-welcome-template).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_followup_templates_provider
  ON public.followup_templates (tenant_id, provider, status)
  WHERE channel_kind = 'whatsapp';

COMMENT ON COLUMN public.followup_templates.provider IS
  'BSP/canal que enviará la plantilla. Valores soportados: ''manual'' (no envío automático), ''ycloud'' (BSP oficial Meta, funcional), ''ghl'' (GHL como BSP, validación empírica pendiente Iota.5 PR-C smoke F), ''meta_cloud'' (Meta directo, aparcado Iota.6).';
