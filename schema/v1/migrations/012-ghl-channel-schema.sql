-- ============================================================================
-- Migration 012 — Extiende enum message_source con 'human' (Bloque C.1 GHL)
-- ============================================================================
-- Postgres ALTER TYPE ADD VALUE no puede ejecutarse en la misma transacción
-- que usa el nuevo valor. Por eso se separa del resto del schema GHL (013).
--
-- 'human' = mensaje del entrenador o closer humano enviado manualmente desde
-- el panel GHL. Se distingue del mensaje IA porque el cuerpo NO contiene el
-- caracter ZERO WIDTH SPACE (ZWSP) que el motor apendea a sus salidas.
-- ============================================================================

ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'human';
