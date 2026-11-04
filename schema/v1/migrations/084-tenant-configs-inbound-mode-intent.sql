-- 084 — Modo `classified_or_intent` para la apertura de Instagram/Facebook (2026-11-04)
--
-- Las migraciones 039 (`ghl_inbound_mode`) y 042 (`manychat_inbound_mode`)
-- dejaron un CHECK con dos valores: `classified_only` y `all`. Este añade el
-- tercero. El default NO cambia: sigue siendo `classified_only`.
--
-- Qué hace el modo nuevo (motor `inbound-intent-gate.ts`): con el primer
-- mensaje de una persona sin origen clasificado,
--   - si casa una palabra clave de tipo `inbound`, también suelta («espalda»,
--     «info» a secas), la conversación se clasifica `inbound` y la IA entra,
--     como hoy (Iván 4-nov);
--   - el botón de una automatización o la palabra suelta sin palabra clave
--     («Siii😊», «Get started») sigue por su flujo de ManyChat y la IA queda
--     pausada, como hoy;
--   - si es un mensaje suyo (4 palabras o más), un modelo barato lo clasifica:
--     interés real → `inbound` + IA; pregunta por la titulación o se presenta
--     como profesional → pausa + etiqueta «Profesional» (migración 083); otro →
--     pausa.
--   - sin `integration_accounts` activa en el canal (Facebook de Tania) no se
--     llama al modelo: pausa. Modelo caído: pausa.
--
-- Medido en el tenant 7 (desde el 15-sep): 49 aperturas de Instagram de 4 o más
-- palabras, 47 pausadas, 30 sin respuesta de nadie.
--
-- Rollback: volver a crear los dos CHECK con ('classified_only', 'all') tras
-- poner en `classified_only` a quien esté en `classified_or_intent`.

BEGIN;

ALTER TABLE public.tenant_configs
  DROP CONSTRAINT IF EXISTS tenant_configs_ghl_inbound_mode_check;
ALTER TABLE public.tenant_configs
  ADD CONSTRAINT tenant_configs_ghl_inbound_mode_check
  CHECK (ghl_inbound_mode IN ('classified_only', 'classified_or_intent', 'all'));

ALTER TABLE public.tenant_configs
  DROP CONSTRAINT IF EXISTS tenant_configs_manychat_inbound_mode_check;
ALTER TABLE public.tenant_configs
  ADD CONSTRAINT tenant_configs_manychat_inbound_mode_check
  CHECK (manychat_inbound_mode IN ('classified_only', 'classified_or_intent', 'all'));

COMMENT ON COLUMN public.tenant_configs.ghl_inbound_mode IS
  'Política de apertura GHL inbound (IG/FB via webhook OAuth o workflow custom). '
  'classified_only=IA solo dispara si conv.conversation_source IS NOT NULL '
  '(bienvenida/lm/inbound/manual) o casa una palabra clave inbound. '
  'classified_or_intent=además, un primer mensaje de 4+ palabras lo clasifica un '
  'modelo (interés → IA; profesional/otro → pausa). all=cualquier inbound dispara '
  'IA (legacy). Default classified_only (doctrina 2026-05-12; modo intent 2026-11-04).';

COMMENT ON COLUMN public.tenant_configs.manychat_inbound_mode IS
  'Política de apertura ManyChat inbound (IG/FB legacy). Mismos valores y '
  'semántica que ghl_inbound_mode: classified_only | classified_or_intent | all. '
  'Default classified_only (Iván 2026-05-12; modo intent 2026-11-04).';

COMMIT;
