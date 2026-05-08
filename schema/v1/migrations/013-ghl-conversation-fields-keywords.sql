-- ============================================================================
-- Migration 013 — conversation_source + ai_paused_until + automation_keywords
-- ============================================================================
-- Sigue a 012 (que añade enum 'human' a message_source).
--
-- Modelo GHL como canal nativo IG/FB (Bloque C):
--   - conversation_source: clasifica el origen del bloque inicial de la conversación
--     (bienvenida | lm | inbound | manual | NULL) según el primer outbound que GHL
--     reciba. Usado en Fase 2 por el panel kanban para agrupar leads.
--   - ai_paused_until: cuando un OutboundMessage GHL llega sin ZWSP (humano entró
--     manual a la conversación), se setea a 'infinity' y el motor skipea
--     processDebounced. Cuando el panel ofrezca "reactivar IA" (Fase 2), se
--     limpia o se setea fecha futura para reactivar tras X minutos.
--
-- automation_keywords sustituye a la legacy ignored_automation_keywords. Cada
-- tenant define sus patrones de bienvenida/lead-magnet/inbound auto-response.
-- ============================================================================

-- 1) Campos en conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS conversation_source TEXT,
  ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_ai_paused
  ON public.conversations (ai_paused_until)
  WHERE ai_paused_until IS NOT NULL;

COMMENT ON COLUMN public.conversations.conversation_source IS
  'Origen de la conversación: bienvenida | lm | inbound | manual | NULL. Determina qué pipeline visual del SaaS lo agrupa (Fase 2).';
COMMENT ON COLUMN public.conversations.ai_paused_until IS
  'NULL = IA activa. Fecha futura o infinity = IA pausada (humano se hizo cargo). Se setea cuando un OutboundMessage GHL llega sin ZWSP.';

-- 2) Tabla automation_keywords
CREATE TABLE IF NOT EXISTS public.automation_keywords (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('bienvenida','lm','inbound')),
  pattern     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_keywords_tenant_active_type
  ON public.automation_keywords (tenant_id, type, is_active);

COMMENT ON TABLE public.automation_keywords IS
  'Patrones que clasifican mensajes outbound recibidos desde GHL. Sustituto del legacy ignored_automation_keywords. Bienvenida = saludo manual del entrenador. LM = recurso/lead-magnet. Inbound = auto-response automático.';
