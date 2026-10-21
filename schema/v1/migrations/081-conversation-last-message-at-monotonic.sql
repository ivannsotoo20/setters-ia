-- 081 — conversations.last_message_at solo avanza (2026-10-21)
--
-- El trigger `trg_conversation_messages_last` (AFTER INSERT en
-- conversation_messages) copiaba `NEW.sent_at` a `conversations.last_message_at`
-- sin mirar si era más antiguo que lo que ya había.
--
-- Hasta ahora no se notaba porque los mensajes de GHL se fechaban con la hora de
-- la entrega del webhook. Desde que `sent_at` es `dateAdded` (cuándo se escribió:
-- `ghlMessageSentAt` en ghl-message-router.ts), un reintento tardío de GHL
-- (+22 h 53 m y después cada 24 h) entra con su fecha real, que puede ser anterior
-- a mensajes ya guardados. Con el trigger viejo, `last_message_at` retrocedía
-- hasta el siguiente mensaje y lo notaban:
--   - el orden del inbox y del pipeline;
--   - `auto-followup-cron` y `evaluate-inactivity-rules`, que podían tomar por
--     inactiva una conversación viva;
--   - el dashboard (activas en el periodo);
--   - el desempate del `appointment-matcher`.
--
-- Cambio: `GREATEST(last_message_at, NEW.sent_at)`. GREATEST ignora NULL, así que
-- una conversación sin mensajes previos toma el primero. Todo lo demás queda
-- igual: mismo cuerpo, SECURITY INVOKER, `search_path` fijado y `updated_at = NOW()`.
--
-- Orden de despliegue: antes que el motor que fecha GHL con `dateAdded`, o a la
-- vez. El motor viejo no lo nota: sus fechas siempre avanzan.
--
-- Rollback (cuerpo anterior):
--   CREATE OR REPLACE FUNCTION public.update_conversation_last_message_at()
--   RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
--   BEGIN
--     UPDATE public.conversations
--        SET last_message_at = NEW.sent_at,
--            updated_at = NOW()
--      WHERE id = NEW.conversation_id;
--     RETURN NEW;
--   END;
--   $$;

CREATE OR REPLACE FUNCTION public.update_conversation_last_message_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = GREATEST(last_message_at, NEW.sent_at),
         updated_at = NOW()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
