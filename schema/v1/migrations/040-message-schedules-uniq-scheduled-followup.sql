-- 040-message-schedules-uniq-scheduled-followup.sql
-- Sprint Iota.3 — previene duplicados de follow-up auto programados al mismo
-- segundo en una misma conversación.
--
-- Bug origen (visible 2026-05-12): Iván reporta dos mensajes idénticos de
-- follow-up enviados al mismo lead a las 07:21 (par #87+#88 conv 7, ambos con
-- scheduled_at=2026-05-12 07:18:52). Ambos fueron creados por
-- `materializeFollowupSequenceForConv` (apps/panel/lib/actions/materialize-followup.ts)
-- al pre-materializar toda la secuencia. El window-adjustment del while loop
-- colapsó los `scheduledAt` de idx=0 e idx=1 al mismo punto, y outbound-sender
-- los pescó juntos enviando 2 veces el mismo mensaje.
--
-- Solución: índice único parcial sobre (conversation_id, scheduled_at) para
-- FUs auto pending/processing. Permite que la SECUENCIA tenga >1 pending con
-- scheduled_at DISTINTOS (intervals [6h, 12h] de la config), pero rechaza un
-- segundo INSERT con MISMO scheduled_at de la misma conv. Caller debe capturar
-- error 23505 (unique_violation) y tratar como skip silencioso.
--
-- Cleanup previo: no quedan duplicados activos con mismo (conv, scheduled_at)
-- — los pares anteriores ya están cancelled o ya se cancelaron defensivamente.

CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_unique_scheduled_per_conv
ON public.message_schedules (conversation_id, scheduled_at)
WHERE status IN ('pending', 'processing')
  AND message_type = 'follow_up'
  AND triggered_by = 'auto_inactivity';

COMMENT ON INDEX public.uq_followup_unique_scheduled_per_conv IS
  'Sprint Iota.3 — anti-dup FU auto. Bloquea INSERT con mismo (conv, scheduled_at) '
  'cuando ya hay uno pending/processing del mismo tipo. Caller maneja 23505.';
