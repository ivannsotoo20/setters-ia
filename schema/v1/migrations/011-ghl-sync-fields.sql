-- ============================================================================
-- Migration 011 — GHL sync fields on conversations
-- ============================================================================
-- Hito 10: replicar inbound + outbound + opportunity stage moves al GHL CRM del
-- trainer. Cada conversación guarda los IDs que GHL asigna a contact, opportunity
-- y la conversación interna (para no buscar siempre).
--
-- Los 3 campos son nullable porque tenants legacy sin GHL los dejan en NULL.
-- El motor lee `integration_accounts` provider='ghl' y, si existe, replica;
-- si no, salta (best-effort, no rompe pipeline si GHL está caído).
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_conversation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_ghl_contact_id
  ON public.conversations (ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_ghl_opportunity_id
  ON public.conversations (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.ghl_contact_id IS
  'GHL contact id resuelto en upsertContact al primer inbound. NULL si tenant no tiene GHL configurado.';
COMMENT ON COLUMN public.conversations.ghl_opportunity_id IS
  'GHL opportunity id creado en pipeline F1-F6 al primer inbound. NULL si tenant no tiene GHL.';
COMMENT ON COLUMN public.conversations.ghl_conversation_id IS
  'GHL conversation id devuelto en el primer registerInbound/registerOutbound. NULL si aún no se replicó.';
