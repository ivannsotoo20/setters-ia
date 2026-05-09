-- Migration 023 — Sprint Zeta foundation: campos para chat shell + tabla notes.
--
-- Sprint Zeta (2026-05-09):
--   - is_unread / is_blocked / assigned_user_id en conversations
--   - first_ai_message_at / first_lead_response_at denormalizados (para Sprint Theta)
--   - tabla conversation_notes (notas internas, visible solo al equipo)

BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_unread BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_ai_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_lead_response_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_unread_tenant
  ON public.conversations(tenant_id, is_unread) WHERE is_unread = TRUE;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON public.conversations(assigned_user_id) WHERE assigned_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_notes_conv_created
  ON public.conversation_notes(conversation_id, created_at DESC);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_notes_read" ON public.conversation_notes;
CREATE POLICY "conversation_notes_read" ON public.conversation_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_agency_admin = TRUE OR p.tenant_id = conversation_notes.tenant_id)
    )
  );

-- Sin policy de write: server actions usan service_role.

COMMIT;
