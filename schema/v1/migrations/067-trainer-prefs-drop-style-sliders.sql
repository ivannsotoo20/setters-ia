-- =============================================================================
-- Migration 067 — trainer_preferences: dropear messageLengthDensity + toneRegister
-- =============================================================================
--
-- Sprint Hito 12.1 (2026-05-20): Iván decide que los sliders de "Longitud de
-- mensajes" y "Tono" (Sprint Gamma 2.5b/B) salen del schema de preferencias
-- del trainer. La longitud de mensajes y el tono se gestionan directamente
-- desde `core_v5_base` (Cerebro v5 narrativo) y `coach_v5` (voz/criterios por
-- tenant) — no como toggles del trainer.
--
-- Razón: el trainer no es el rol adecuado para configurar estilo conversacional
-- a ese nivel; eso lo ajusta Iván cuando hace onboarding del trainer en el
-- coach. Las 2 sliders eran cosméticos sin enforce real (best effort), así que
-- removerlos NO cambia el comportamiento del setter — solo limpia la UI.
--
-- Cambios:
--   1. Drop de las claves `messageLengthDensity` y `toneRegister` del JSONB
--      `preferences` en TODOS los tenants existentes (idempotente — si no
--      tienen las claves, `preferences - 'k'` es no-op).
--   2. Update del COMMENT de la columna `preferences` para reflejar el shape
--      v7 (sin las 2 claves obsoletas).
--
-- Compat:
--   - El parser TS en apps/panel/lib/trainer-prefs-serializer.ts ya ignora las
--     claves silenciosamente desde este sprint (tests cubren el caso). Aunque
--     no apliquemos esta migration, el sistema sigue funcionando — esta es
--     cosmética de BD para mantener el JSONB limpio.
--   - El bloque `trainer_prefs_v1` markdown ya NO emite líneas para esas claves
--     desde este sprint, así que los tenants legacy no propagan información
--     obsoleta al setter.
-- =============================================================================

UPDATE public.trainer_preferences
SET preferences = (preferences - 'messageLengthDensity') - 'toneRegister'
WHERE preferences ? 'messageLengthDensity' OR preferences ? 'toneRegister';

COMMENT ON COLUMN public.trainer_preferences.preferences IS
  'JSONB con toggles tipados del trainer. Schema v7 (Hito 12.1 cleanup, 2026-05-20). Estilo (estricto): addressingMode tu|usted|mirror_lead, aiMessagesPerTurnMax 1-4. Emoticonos: emojisEnabled bool, emojiFrequencyPerMessages 1-3, emojiMaxPerConversation 1-8, customEmojis array. Cualificacion: qualificationQuestionsEnabled bool, extraQuestionsBeforeCall 0-2, callProposalMode calendar|form|human_handoff, closingResourceUrl str|null, calendarClosingMessage str|null. Cumplimiento estricto: forbiddenPhrases string[] (0-10). Contacto: trainerName/Email/Phone str|null. Handoff: handoffPersonalizationEnabled bool, handoffMode share_phone|silent|custom_message, handoffCustomTemplate warm|professional|free, handoffCustomMessage str|null. Hito 11: schedulingMode direct|link|null, trainerTimezone IANA|null. Notificaciones: notificationSubscriptions array. ELIMINADAS en Hito 12.1: messageLengthDensity, toneRegister (gestionados desde core_v5_base + coach_v5).';
