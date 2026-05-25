-- Migration 070 — añadir 'ai_turn' al CHECK constraint de message_schedules.triggered_by
--
-- Contexto: Hito 10.6.1 introdujo el valor 'ai_turn' en el código (scheduler.ts
-- y outbound-sender.ts) para distinguir las partes del bot del turno actual
-- (que el outbound-gate deja pasar aunque la IA esté pausada). Pero la
-- migration 028-followups-per-channel-full.sql creó el CHECK constraint con
-- solo ('manual', 'auto_inactivity', 'manual_pipeline') — se olvidó añadir
-- 'ai_turn' cuando se introdujo el valor.
--
-- Síntoma observado en producción (2026-05-25): TODO turno IA fallaba en el
-- INSERT a message_schedules con error 23514 (CHECK violation). El throw
-- propagaba FUERA del try/catch de runPipeline en process-debounced.ts, por
-- lo que ni completePipelineRun ni failPipelineRun se ejecutaban → pipeline_runs
-- quedaba 'in_progress' eternamente. Diagnosticado como "hang post-Judge" pero
-- realmente era CHECK violation no capturada.
--
-- Confirmado experimentalmente con INSERT en transacción ROLLBACK:
--   ERROR: 23514: new row for relation "message_schedules" violates check
--   constraint "message_schedules_triggered_by_check"
--
-- Fix: drop + recreate constraint con 'ai_turn' incluido.

ALTER TABLE public.message_schedules DROP CONSTRAINT IF EXISTS message_schedules_triggered_by_check;

ALTER TABLE public.message_schedules ADD CONSTRAINT message_schedules_triggered_by_check
  CHECK (triggered_by IN ('manual','auto_inactivity','manual_pipeline','ai_turn'));

COMMENT ON CONSTRAINT message_schedules_triggered_by_check ON public.message_schedules IS
  'Valores permitidos: manual (envío directo trainer), auto_inactivity (followup cron Sprint Eta), manual_pipeline (pipeline ejecutado manualmente desde panel), ai_turn (partes del turno IA — outbound-gate las deja pasar aunque IA esté pausada).';
