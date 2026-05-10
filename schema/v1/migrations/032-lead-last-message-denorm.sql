-- ============================================================
-- Migration 032 — Sprint Mu.2 — Lead-level denormalization + indexes
-- ============================================================
-- Por qué: la sección /contacts necesita listar miles de leads × decenas
-- de sub-cuentas con sort por "último mensaje", filtros server-side y
-- búsqueda fuzzy. Hoy `leads.last_message_at` no existe — se calcula in-JS
-- desde MAX(conversation_messages.sent_at) joinado vía conversations. No
-- escala. Esta migration:
--   1. Añade `leads.last_message_at` denormalizado.
--   2. Backfilla desde datos existentes.
--   3. Trigger que lo mantiene en cada nuevo mensaje.
--   4. Índice (tenant_id, last_message_at DESC NULLS LAST, id) para
--      paginación cursor-based.
--   5. GIN trigram indexes en campos de búsqueda libre (pg_trgm v1.6 ya
--      instalado en el proyecto).
-- ============================================================

BEGIN;

-- 1) Columna denormalizada
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- 2) Backfill desde datos existentes (idempotente — si vuelve a correr,
--    solo refresca a partir de datos actuales).
UPDATE public.leads l
SET last_message_at = sub.max_sent_at
FROM (
  SELECT c.lead_id, MAX(cm.sent_at) AS max_sent_at
  FROM public.conversations c
  JOIN public.conversation_messages cm ON cm.conversation_id = c.id
  GROUP BY c.lead_id
) sub
WHERE l.id = sub.lead_id
  AND (l.last_message_at IS DISTINCT FROM sub.max_sent_at);

-- 3) Trigger que mantiene leads.last_message_at en cada nuevo mensaje.
CREATE OR REPLACE FUNCTION public.update_lead_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.leads l
  SET last_message_at = NEW.sent_at,
      updated_at = now()
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id
    AND c.lead_id = l.id
    AND (l.last_message_at IS NULL OR l.last_message_at < NEW.sent_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_lead_last_message_at ON public.conversation_messages;
CREATE TRIGGER trg_update_lead_last_message_at
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_last_message_at();

-- 4) Índice principal para listado paginado.
--    ORDER BY last_message_at DESC NULLS LAST + tiebreaker por id (cursor).
CREATE INDEX IF NOT EXISTS idx_leads_tenant_last_msg
  ON public.leads (tenant_id, last_message_at DESC NULLS LAST, id);

-- 5) GIN trigram indexes para búsqueda fuzzy escalable.
CREATE INDEX IF NOT EXISTS idx_leads_first_name_trgm
  ON public.leads USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_last_name_trgm
  ON public.leads USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON public.leads USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_username_trgm
  ON public.leads USING gin (username gin_trgm_ops);
-- email es CITEXT — castear a text para pg_trgm.
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm
  ON public.leads USING gin ((email::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_external_id_trgm
  ON public.leads USING gin (external_id gin_trgm_ops);

COMMIT;
